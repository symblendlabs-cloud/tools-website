import { describe, it, expect } from "vitest";
import {
  parseTracestate,
  formatTracestate,
  MAX_LIST_MEMBERS,
  MAX_KEY_LENGTH,
  MAX_VALUE_LENGTH,
  RECOMMENDED_COMBINED_LENGTH,
} from "../tracestate";
import { simulatePropagation } from "../trace-context";

describe("parseTracestate — valid input", () => {
  it("accepts a single entry", () => {
    const r = parseTracestate("vendor=value");
    expect(r.ok).toBe(true);
    expect(r.entries).toEqual([{ key: "vendor", value: "value" }]);
  });

  it("accepts multiple entries and preserves order", () => {
    const r = parseTracestate("alpha=1,beta=2,gamma=3");
    expect(r.entries.map((e) => e.key)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("accepts keys with allowed punctuation", () => {
    const r = parseTracestate("a_b-c*d/e@f=value");
    expect(r.ok).toBe(true);
  });


  it("tolerates optional whitespace after comma", () => {
    const r = parseTracestate("a=1, b=2, c=3");
    expect(r.entries.map((e) => e.key)).toEqual(["a", "b", "c"]);
  });

  it("skips empty and whitespace-only members", () => {
    const r = parseTracestate(", a=1, , b=2, ");
    expect(r.ok).toBe(true);
    expect(r.entries.map((e) => e.key)).toEqual(["a", "b"]);
  });

  it("accepts an empty string", () => {
    const r = parseTracestate("");
    expect(r.ok).toBe(true);
    expect(r.entries).toEqual([]);
  });
});

describe("parseTracestate — invalid input", () => {
  it("rejects uppercase keys", () => {
    const r = parseTracestate("Vendor=value");
    expect(r.ok).toBe(false);
  });

  it("rejects keys with disallowed punctuation", () => {
    const r = parseTracestate("ven!dor=value");
    expect(r.ok).toBe(false);
  });

  it("rejects missing equal sign", () => {
    const r = parseTracestate("invalid");
    expect(r.ok).toBe(false);
  });

  it("rejects a value containing a comma would be impossible (split)", () => {
    const r = parseTracestate("a=va,lue");
    // "a=va" is valid, "lue" is missing '='
    expect(r.ok).toBe(false);
  });

  it("rejects a key over 256 characters", () => {
    const key = "a".repeat(MAX_KEY_LENGTH + 1);
    const r = parseTracestate(`${key}=value`);
    expect(r.ok).toBe(false);
  });

  it("rejects a value over 256 characters", () => {
    const value = "v".repeat(MAX_VALUE_LENGTH + 1);
    const r = parseTracestate(`a=${value}`);
    expect(r.ok).toBe(false);
  });

  it("rejects more than 32 members", () => {
    const members = Array.from(
      { length: MAX_LIST_MEMBERS + 1 },
      (_, i) => `k${i}=v`,
    );
    const r = parseTracestate(members.join(","));
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/maximum is 32/);
  });

  it("rejects duplicate keys", () => {
    const r = parseTracestate("a=1,a=2");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/duplicate/i);
  });
});

describe("parseTracestate — 512-char advisory", () => {
  it("warns (but does not fail) when the combined string exceeds 512 characters", () => {
    const members = Array.from({ length: 8 }, (_, i) => {
      const value = "v".repeat(MAX_VALUE_LENGTH);
      return `key${i}=${value}`;
    });
    const combined = members.join(",");
    expect(combined.length).toBeGreaterThan(RECOMMENDED_COMBINED_LENGTH);
    const r = parseTracestate(combined);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/512/);
  });
});

describe("formatTracestate", () => {
  it("round-trips entries through parse and format", () => {
    const original = "a=1,b=2,c=3";
    const parsed = parseTracestate(original);
    expect(formatTracestate(parsed.entries)).toBe(original);
  });

  it("preserves order", () => {
    const parsed = parseTracestate("zeta=1,alpha=2,mu=3");
    expect(formatTracestate(parsed.entries)).toBe("zeta=1,alpha=2,mu=3");
  });
});

describe("parseTracestate — Level 2 key grammar", () => {
  it("accepts a key starting with a lowercase letter", () => {
    const r = parseTracestate("abc=value");
    expect(r.ok).toBe(true);
  });

  it("accepts a key starting with a digit", () => {
    const r = parseTracestate("123=value");
    expect(r.ok).toBe(true);
    expect(r.entries[0]?.key).toBe("123");
  });

  it("accepts @ as a keychar", () => {
    const r = parseTracestate("vendor@example=value");
    expect(r.ok).toBe(true);
    expect(r.entries[0]?.key).toBe("vendor@example");
  });

  it("accepts @ at the end of a key", () => {
    const r = parseTracestate("vendor@=value");
    expect(r.ok).toBe(true);
  });

  it("accepts multiple @ characters", () => {
    const r = parseTracestate("a@b@c=value");
    expect(r.ok).toBe(true);
  });

  it("accepts a 256-character key", () => {
    const key = "a".repeat(256);
    const r = parseTracestate(`${key}=value`);
    expect(r.ok).toBe(true);
  });

  it("rejects a 257-character key", () => {
    const key = "a".repeat(257);
    const r = parseTracestate(`${key}=value`);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/key exceeds 256/);
  });

  it("rejects a key starting with an uppercase letter", () => {
    const r = parseTracestate("Vendor=value");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/must start with a lowercase letter or digit/);
  });

  it("rejects a key starting with an underscore", () => {
    const r = parseTracestate("_vendor=value");
    expect(r.ok).toBe(false);
  });

  it("rejects a key containing a space", () => {
    const r = parseTracestate("ven dor=value");
    expect(r.ok).toBe(false);
  });

  it("rejects a key containing a dot", () => {
    const r = parseTracestate("vendor.example=value");
    expect(r.ok).toBe(false);
  });
});

describe("parseTracestate — Level 2 value whitespace", () => {
  it("preserves a leading space in the value", () => {
    const r = parseTracestate("vendor= value");
    expect(r.ok).toBe(true);
    expect(r.entries[0]).toEqual({ key: "vendor", value: " value" });
  });

  it("strips trailing OWS (space) from the value", () => {
    const r = parseTracestate("vendor=value ");
    expect(r.ok).toBe(true);
    expect(r.entries[0]).toEqual({ key: "vendor", value: "value" });
  });

  it("strips trailing OWS (tab) from the value", () => {
    const r = parseTracestate("vendor=value\t");
    expect(r.ok).toBe(true);
    expect(r.entries[0]).toEqual({ key: "vendor", value: "value" });
  });

  it("rejects a spaces-only value", () => {
    const r = parseTracestate("vendor=   ");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/value is empty/);
  });

  it("rejects an embedded tab in the value", () => {
    const r = parseTracestate("vendor=va\tlue");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/non-printable/);
  });

  it("rejects a newline inside the value", () => {
    const r = parseTracestate("vendor=va\nlue");
    expect(r.ok).toBe(false);
  });

  it("rejects non-ASCII characters in the value", () => {
    const r = parseTracestate("vendor=naïve");
    expect(r.ok).toBe(false);
  });

  it("accepts internal spaces in the value", () => {
    const r = parseTracestate("vendor=hello world");
    expect(r.ok).toBe(true);
    expect(r.entries[0]?.value).toBe("hello world");
  });

  it("strips leading/trailing OWS around a list member", () => {
    const r = parseTracestate("  a=1  ,  b=2  ");
    expect(r.ok).toBe(true);
    expect(r.entries).toEqual([
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ]);
  });

  it("strips SP and HTAB around a list member", () => {
    const r = parseTracestate("\ta=1\t,\tb=2\t");
    expect(r.ok).toBe(true);
    expect(r.entries.map((e) => e.key)).toEqual(["a", "b"]);
  });

  it("preserves a leading tab in the value (leading OWS after '=' is not OWS)", () => {
    // Note: the assignment's rule is "leading spaces in values preserved".
    // A leading tab is not a space; the strictest reading of the grammar
    // treats a tab after '=' as being *inside* the value. Our parser
    // preserves it, so the value grammar rejects it (tab < 0x20).
    const r = parseTracestate("vendor=\tvalue");
    expect(r.ok).toBe(false);
  });
});

describe("simulatePropagation — strict missing-context handling", () => {
  it("generates a fresh trace only when the incoming traceparent is null", () => {
    const result = simulatePropagation(
      { traceparent: null, tracestate: null, newSampled: null },
      true,
    );
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.traceparent).toMatch(
        /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/,
      );
    }
  });

  it("refuses propagation for an empty-string traceparent", () => {
    const result = simulatePropagation(
      { traceparent: "", tracestate: null, newSampled: null },
      true,
    );
    expect(result.kind).toBe("refused");
  });

  it("refuses propagation for a space-only traceparent", () => {
    const result = simulatePropagation(
      { traceparent: " ", tracestate: null, newSampled: null },
      true,
    );
    expect(result.kind).toBe("refused");
  });

  it("refuses propagation for a tab-only traceparent", () => {
    const result = simulatePropagation(
      { traceparent: "\t", tracestate: null, newSampled: null },
      true,
    );
    expect(result.kind).toBe("refused");
  });

  it("still propagates from a valid version 00 traceparent unchanged", () => {
    const result = simulatePropagation(
      {
        traceparent:
          "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        tracestate: "vendor=value",
        newSampled: null,
      },
      true,
    );
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
      expect(result.parentId).not.toBe("00f067aa0ba902b7");
      expect(result.tracestate).toBe("vendor=value");
      expect(result.traceFlags.sampled).toBe(true);
    }
  });
});