import { describe, it, expect } from "vitest";
import {
  generateTraceId,
  generateParentId,
  generateTraceparent,
  parseTraceparent,
  simulatePropagation,
  TRACE_ID_HEX_LENGTH,
  PARENT_ID_HEX_LENGTH,
} from "../trace-context";

const HEX_LOWER_32 = /^[0-9a-f]{32}$/;
const HEX_LOWER_16 = /^[0-9a-f]{16}$/;
const VALID_TRACEPARENT =
  "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

describe("generateTraceId", () => {
  it("returns 32 lowercase hex characters", () => {
    expect(generateTraceId()).toMatch(HEX_LOWER_32);
    expect(generateTraceId()).toHaveLength(TRACE_ID_HEX_LENGTH);
  });

  it("never returns all zeros across many samples", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTraceId()).not.toBe("0".repeat(32));
    }
  });

  it("returns distinct values across calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(generateTraceId());
    expect(ids.size).toBe(100);
  });
});

describe("generateParentId", () => {
  it("returns 16 lowercase hex characters", () => {
    expect(generateParentId()).toMatch(HEX_LOWER_16);
    expect(generateParentId()).toHaveLength(PARENT_ID_HEX_LENGTH);
  });

  it("never returns all zeros", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateParentId()).not.toBe("0".repeat(16));
    }
  });
});

describe("generateTraceparent", () => {
  it("produces a version 00 header with correct structure", () => {
    const result = generateTraceparent({ sampled: true });
    expect(result.traceparent).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/,
    );
    expect(result.traceId).toMatch(HEX_LOWER_32);
    expect(result.parentId).toMatch(HEX_LOWER_16);
  });

  it("sets sampled flag bit 0 according to input", () => {
    const sampled = generateTraceparent({ sampled: true });
    expect(sampled.traceFlags.sampled).toBe(true);
    const notSampled = generateTraceparent({ sampled: false });
    expect(notSampled.traceFlags.sampled).toBe(false);
  });

  it("always sets the random trace ID flag (bit 1)", () => {
    expect(generateTraceparent({ sampled: true }).traceFlags.randomTraceId).toBe(
      true,
    );
    expect(
      generateTraceparent({ sampled: false }).traceFlags.randomTraceId,
    ).toBe(true);
  });

  it("keeps reserved bits zero", () => {
    expect(generateTraceparent({ sampled: true }).traceFlags.reserved).toBe(0);
  });

  it("round-trips through parseTraceparent", () => {
    const generated = generateTraceparent({ sampled: true });
    const parsed = parseTraceparent(generated.traceparent);
    expect(parsed.kind).toBe("supported");
    if (parsed.kind === "supported") {
      expect(parsed.traceId).toBe(generated.traceId);
      expect(parsed.parentId).toBe(generated.parentId);
      expect(parsed.traceFlags.sampled).toBe(true);
      expect(parsed.traceFlags.randomTraceId).toBe(true);
    }
  });
});

describe("parseTraceparent — valid version 00", () => {
  it("accepts a valid header and decodes flags", () => {
    const parsed = parseTraceparent(VALID_TRACEPARENT);
    expect(parsed.kind).toBe("supported");
    if (parsed.kind === "supported") {
      expect(parsed.version).toBe("00");
      expect(parsed.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
      expect(parsed.parentId).toBe("00f067aa0ba902b7");
      expect(parsed.traceFlags.sampled).toBe(true);
      expect(parsed.traceFlags.randomTraceId).toBe(false);
      expect(parsed.traceFlags.reserved).toBe(0);
    }
  });

  it("decodes sampled from bit 0, random from bit 1", () => {
    const flags01 = parseTraceparent(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    );
    if (flags01.kind === "supported") {
      expect(flags01.traceFlags.sampled).toBe(true);
      expect(flags01.traceFlags.randomTraceId).toBe(false);
    }
    const flags02 = parseTraceparent(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-02",
    );
    if (flags02.kind === "supported") {
      expect(flags02.traceFlags.sampled).toBe(false);
      expect(flags02.traceFlags.randomTraceId).toBe(true);
    }
    const flags03 = parseTraceparent(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-03",
    );
    if (flags03.kind === "supported") {
      expect(flags03.traceFlags.sampled).toBe(true);
      expect(flags03.traceFlags.randomTraceId).toBe(true);
    }
  });

  it("decodes reserved flag bits independently of sampled/random", () => {
    const parsed = parseTraceparent(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-ff",
    );
    if (parsed.kind === "supported") {
      expect(parsed.traceFlags.sampled).toBe(true);
      expect(parsed.traceFlags.randomTraceId).toBe(true);
      expect(parsed.traceFlags.reserved).toBe(0x3f);
    }
  });
});

describe("parseTraceparent — invalid version 00", () => {
  it("rejects missing separators", () => {
    const parsed = parseTraceparent(
      "00_4bf92f3577b34da6a3ce929d0e0e4736_00f067aa0ba902b7_01",
    );
    expect(parsed.kind).toBe("invalid");
  });

  it("rejects extra fields", () => {
    const parsed = parseTraceparent(`${VALID_TRACEPARENT}-extra`);
    expect(parsed.kind).toBe("invalid");
  });

  it("rejects uppercase hex", () => {
    const parsed = parseTraceparent(
      "00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01",
    );
    expect(parsed.kind).toBe("invalid");
  });

  it("rejects short trace-id", () => {
    const parsed = parseTraceparent(
      "00-4bf92f3577b34da6a3ce929d0e0e473-00f067aa0ba902b7-01",
    );
    expect(parsed.kind).toBe("invalid");
  });

  it("rejects short parent-id", () => {
    const parsed = parseTraceparent(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b-01",
    );
    expect(parsed.kind).toBe("invalid");
  });

  it("rejects short trace-flags", () => {
    const parsed = parseTraceparent(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-0",
    );
    expect(parsed.kind).toBe("invalid");
  });

  it("rejects all-zero trace-id", () => {
    const parsed = parseTraceparent(
      "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
    );
    expect(parsed.kind).toBe("invalid");
  });

  it("rejects all-zero parent-id", () => {
    const parsed = parseTraceparent(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01",
    );
    expect(parsed.kind).toBe("invalid");
  });

  it("rejects forbidden version ff", () => {
    const parsed = parseTraceparent(
      "ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    );
    expect(parsed.kind).toBe("invalid");
  });

  it("rejects empty input", () => {
    expect(parseTraceparent("").kind).toBe("invalid");
    expect(parseTraceparent("   ").kind).toBe("invalid");
  });

  it("includes field-specific error messages", () => {
    const parsed = parseTraceparent(
      "00-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-00f067aa0ba902b7-01",
    );
    expect(parsed.kind).toBe("invalid");
    if (parsed.kind === "invalid") {
      expect(parsed.errors.join(" ")).toMatch(/trace-id/);
    }
  });
});

describe("parseTraceparent — future versions", () => {
  it("recognizes version 01 as future, not invalid", () => {
    const parsed = parseTraceparent(
      "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    );
    expect(parsed.kind).toBe("future");
    if (parsed.kind === "future") {
      expect(parsed.version).toBe("01");
      expect(parsed.base?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    }
  });

  it("recognizes version fe as future", () => {
    const parsed = parseTraceparent(
      "fe-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    );
    expect(parsed.kind).toBe("future");
  });

  it("still rejects grammar errors on future versions", () => {
    const parsed = parseTraceparent(
      "01-00000000000000000000000000000000-00f067aa0ba902b7-01",
    );
    expect(parsed.kind).toBe("invalid");
  });
});

describe("simulatePropagation", () => {
  it("preserves trace-id and regenerates parent-id for valid v00 input", () => {
    const result = simulatePropagation(
      {
        traceparent: VALID_TRACEPARENT,
        tracestate: null,
        newSampled: null,
      },
      true,
    );
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
      expect(result.parentId).not.toBe("00f067aa0ba902b7");
      expect(result.traceFlags.sampled).toBe(true);
    }
  });

  it("preserves random-trace-id flag from incoming", () => {
    const withRandom = simulatePropagation(
      {
        traceparent:
          "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-02",
        tracestate: null,
        newSampled: null,
      },
      true,
    );
    if (withRandom.kind === "ok") {
      expect(withRandom.traceFlags.randomTraceId).toBe(true);
    }
    const withoutRandom = simulatePropagation(
      {
        traceparent:
          "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        tracestate: null,
        newSampled: null,
      },
      true,
    );
    if (withoutRandom.kind === "ok") {
      expect(withoutRandom.traceFlags.randomTraceId).toBe(false);
    }
  });

  it("preserves sampled flag by default", () => {
    const result = simulatePropagation(
      {
        traceparent:
          "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00",
        tracestate: null,
        newSampled: null,
      },
      true,
    );
    if (result.kind === "ok") {
      expect(result.traceFlags.sampled).toBe(false);
    }
  });

  it("allows explicit sampled override", () => {
    const result = simulatePropagation(
      {
        traceparent:
          "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00",
        tracestate: null,
        newSampled: true,
      },
      true,
    );
    if (result.kind === "ok") {
      expect(result.traceFlags.sampled).toBe(true);
    }
  });

  it("keeps reserved bits zero on outgoing", () => {
    const result = simulatePropagation(
      {
        traceparent:
          "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-ff",
        tracestate: null,
        newSampled: null,
      },
      true,
    );
    if (result.kind === "ok") {
      expect(result.traceFlags.reserved).toBe(0);
    }
  });

  it("preserves valid tracestate verbatim", () => {
    const result = simulatePropagation(
      {
        traceparent: VALID_TRACEPARENT,
        tracestate: "vendor=value,other=value2",
        newSampled: null,
      },
      true,
    );
    if (result.kind === "ok") {
      expect(result.tracestate).toBe("vendor=value,other=value2");
    }
  });

  it("drops invalid tracestate but still propagates valid traceparent", () => {
    const result = simulatePropagation(
      {
        traceparent: VALID_TRACEPARENT,
        tracestate: "BAD=",
        newSampled: null,
      },
      false,
    );
    if (result.kind === "ok") {
      expect(result.tracestate).toBeNull();
      expect(result.notes.join(" ")).toMatch(/dropped/i);
    }
  });

  it("generates fresh trace when traceparent is missing", () => {
    const result = simulatePropagation(
      { traceparent: null, tracestate: "vendor=value", newSampled: null },
      false,
    );
    if (result.kind === "ok") {
      expect(result.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
      expect(result.tracestate).toBeNull();
      expect(result.notes.join(" ")).toMatch(/discarded/i);
    }
  });

  it("refuses to propagate from invalid traceparent", () => {
    const result = simulatePropagation(
      {
        traceparent:
          "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
        tracestate: null,
        newSampled: null,
      },
      true,
    );
    expect(result.kind).toBe("refused");
  });

  it("refuses to propagate from future version", () => {
    const result = simulatePropagation(
      {
        traceparent:
          "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        tracestate: null,
        newSampled: null,
      },
      true,
    );
    expect(result.kind).toBe("refused");
  });
});

describe("parseTraceparent — future versions with extra fields", () => {
  it("accepts a future version with one extra field", () => {
    const parsed = parseTraceparent(
      "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-extra",
    );
    expect(parsed.kind).toBe("future");
    if (parsed.kind === "future") {
      expect(parsed.extraFieldCount).toBe(1);
      expect(parsed.base?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
      expect(parsed.base?.parentId).toBe("00f067aa0ba902b7");
    }
  });

  it("accepts a future version with multiple extra fields", () => {
    const parsed = parseTraceparent(
      "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-extra1-extra2",
    );
    expect(parsed.kind).toBe("future");
    if (parsed.kind === "future") {
      expect(parsed.extraFieldCount).toBe(2);
    }
  });

  it("rejects a future version with a malformed trace-id", () => {
    const parsed = parseTraceparent(
      "01-4bf92f3577b34da6a3ce929d0e0e473-00f067aa0ba902b7-01-extra",
    );
    expect(parsed.kind).toBe("invalid");
  });

  it("rejects a future version with an all-zero parent-id", () => {
    const parsed = parseTraceparent(
      "01-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01-extra",
    );
    expect(parsed.kind).toBe("invalid");
  });

  it("rejects a future version with fewer than 4 base fields", () => {
    const parsed = parseTraceparent(
      "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7",
    );
    expect(parsed.kind).toBe("invalid");
  });

  it("still rejects version 00 with extra fields", () => {
    const parsed = parseTraceparent(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-extra",
    );
    expect(parsed.kind).toBe("invalid");
    if (parsed.kind === "invalid") {
      expect(parsed.errors.join(" ")).toMatch(/exactly 4/);
    }
  });

  it("still rejects version ff with extra fields", () => {
    const parsed = parseTraceparent(
      "ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-extra",
    );
    expect(parsed.kind).toBe("invalid");
  });

  it("future version is still refused by propagation simulation", () => {
    const result = simulatePropagation(
      {
        traceparent:
          "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-extra",
        tracestate: null,
        newSampled: null,
      },
      true,
    );
    expect(result.kind).toBe("refused");
  });
});

describe("parseTraceparent — version 00 behavior unchanged", () => {
  it("still accepts the canonical valid v00 header", () => {
    const parsed = parseTraceparent(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    );
    expect(parsed.kind).toBe("supported");
  });

  it("still rejects v00 with a missing field", () => {
    const parsed = parseTraceparent(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7",
    );
    expect(parsed.kind).toBe("invalid");
  });
});

describe("parseTraceparent — strict raw input", () => {
  it("rejects leading whitespace", () => {
    const parsed = parseTraceparent(
      " 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    );
    expect(parsed.kind).toBe("invalid");
    if (parsed.kind === "invalid") {
      expect(parsed.errors.join(" ")).toMatch(/leading or trailing whitespace/);
    }
  });

  it("rejects trailing whitespace", () => {
    const parsed = parseTraceparent(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01 ",
    );
    expect(parsed.kind).toBe("invalid");
    if (parsed.kind === "invalid") {
      expect(parsed.errors.join(" ")).toMatch(/leading or trailing whitespace/);
    }
  });

  it("rejects a leading newline", () => {
    const parsed = parseTraceparent(
      "\n00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    );
    expect(parsed.kind).toBe("invalid");
  });

  it("rejects a trailing tab", () => {
    const parsed = parseTraceparent(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01\t",
    );
    expect(parsed.kind).toBe("invalid");
  });

  it("still accepts a canonical v00 header with no surrounding whitespace", () => {
    const parsed = parseTraceparent(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    );
    expect(parsed.kind).toBe("supported");
  });

  it("still accepts a future version with extra fields and no surrounding whitespace", () => {
    const parsed = parseTraceparent(
      "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-extra",
    );
    expect(parsed.kind).toBe("future");
  });

  it("rejects a future version with leading whitespace", () => {
    const parsed = parseTraceparent(
      " 01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-extra",
    );
    expect(parsed.kind).toBe("invalid");
  });
});