// src/tools/iso27001-control-mapping-checker/__tests__/applicability.test.ts
import { describe, it, expect } from "vitest";
import {
  defaultApplicability,
  deriveControlState,
  setApplicability,
  validateApplicabilityDecision,
} from "../applicability";
import type { MappingEdge } from "../types";

const edge = (over: Partial<MappingEdge>): MappingEdge => ({
  policyId: "p1",
  controlId: "A.5.1",
  source: "keyword_suggestion",
  reviewStatus: "unreviewed",
  matchReason: "test",
  ...over,
});

describe("defaultApplicability", () => {
  it("returns 93 controls all with not_assessed", () => {
    const map = defaultApplicability();
    expect(Object.keys(map)).toHaveLength(93);
    for (const v of Object.values(map)) {
      expect(v.state).toBe("not_assessed");
    }
  });
});

describe("validateApplicabilityDecision", () => {
  it("accepts applicable without justification", () => {
    expect(validateApplicabilityDecision({ controlId: "A.5.1", state: "applicable" }).ok).toBe(true);
  });

  it("accepts not_applicable with justification", () => {
    expect(
      validateApplicabilityDecision({ controlId: "A.5.1", state: "not_applicable", justification: "Out of scope" }).ok,
    ).toBe(true);
  });

  it("rejects not_applicable without justification", () => {
    const r = validateApplicabilityDecision({ controlId: "A.5.1", state: "not_applicable" });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/justification/i);
  });

  it("rejects unknown control ID", () => {
    const r = validateApplicabilityDecision({ controlId: "A.9.9", state: "applicable" });
    expect(r.ok).toBe(false);
  });
});

describe("setApplicability", () => {
  it("does not change mapping edges when applicability changes", () => {
    const base = defaultApplicability();
    const { next } = setApplicability(base, "A.5.1", "applicable");
    expect(next["A.5.1"]!.state).toBe("applicable");
    expect(base["A.5.1"]!.state).toBe("not_assessed"); // original untouched
  });

  it("does not commit an invalid change", () => {
    const base = defaultApplicability();
    const { next, validation } = setApplicability(base, "A.5.1", "not_applicable");
    expect(validation.ok).toBe(false);
    expect(next).toBe(base);
  });
});

describe("deriveControlState", () => {
  const app = defaultApplicability();

  it("returns not_assessed by default", () => {
    expect(deriveControlState("A.5.1", app, [])).toBe("not_assessed");
  });

  it("returns excluded for not_applicable", () => {
    const a = { ...app, "A.5.1": { controlId: "A.5.1", state: "not_applicable" as const, justification: "x" } };
    expect(deriveControlState("A.5.1", a, [])).toBe("excluded");
  });

  it("returns covered when applicable + accepted edge", () => {
    const a = { ...app, "A.5.1": { controlId: "A.5.1", state: "applicable" as const } };
    expect(deriveControlState("A.5.1", a, [edge({ reviewStatus: "accepted" })])).toBe("covered");
  });

  it("returns suggested when applicable + unreviewed suggestion", () => {
    const a = { ...app, "A.5.1": { controlId: "A.5.1", state: "applicable" as const } };
    expect(deriveControlState("A.5.1", a, [edge({})])).toBe("suggested");
  });

  it("returns rejected_only when applicable + only rejected edges", () => {
    const a = { ...app, "A.5.1": { controlId: "A.5.1", state: "applicable" as const } };
    expect(deriveControlState("A.5.1", a, [edge({ reviewStatus: "rejected" })])).toBe("rejected_only");
  });

  it("returns unmapped when applicable + no edges", () => {
    const a = { ...app, "A.5.1": { controlId: "A.5.1", state: "applicable" as const } };
    expect(deriveControlState("A.5.1", a, [])).toBe("unmapped");
  });
});
