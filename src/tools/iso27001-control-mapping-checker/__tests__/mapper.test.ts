// src/tools/iso27001-control-mapping-checker/__tests__/mapper.test.ts
import { describe, it, expect } from "vitest";
import {
  declaredRefEdges,
  dedupeEdges,
  extractExplicitControlRefs,
  initialEdgesForPolicy,
  suggestMappings,
} from "../mapper";
import type { MappingEdge, PolicyRecord } from "../types";

const policy = (over: Partial<PolicyRecord> = {}): PolicyRecord => ({
  policyId: "p1",
  policyName: "Access control policy",
  policyDescription: "Defines access control and privileged access rights.",
  ...over,
});

describe("extractExplicitControlRefs", () => {
  it("finds canonical IDs in the description", () => {
    expect(extractExplicitControlRefs(policy({ policyDescription: "Covers A.5.15 and A.8.2." }))).toEqual([
      "A.5.15",
      "A.8.2",
    ]);
  });

  it("finds IDs in the evidence reference field", () => {
    expect(extractExplicitControlRefs(policy({ evidenceRefs: "A.8.24" }))).toEqual(["A.8.24"]);
  });

  it("ignores malformed or out-of-range IDs", () => {
    expect(extractExplicitControlRefs(policy({ policyDescription: "See A.5.999, 5.1, A.9.1." }))).toEqual([]);
  });

  it("deduplicates repeated IDs", () => {
    expect(extractExplicitControlRefs(policy({ policyDescription: "A.5.15 then A.5.15 again." }))).toEqual(["A.5.15"]);
  });
});

describe("declaredRefEdges", () => {
  it("produces unreviewed user_declared_ref edges", () => {
    const edges = declaredRefEdges(policy({ policyDescription: "Covers A.8.2." }));
    expect(edges).toHaveLength(1);
    expect(edges[0]!.source).toBe("user_declared_ref");
    expect(edges[0]!.reviewStatus).toBe("unreviewed");
    expect(edges[0]!.matchReason.toLowerCase()).toContain("explicit");
  });
});

describe("suggestMappings", () => {
  it("produces an edge with a human-readable matchReason for a phrase match", () => {
    const edges = suggestMappings(policy({ policyName: "Access control policy", policyDescription: "Access control is defined." }));
    const a515 = edges.find((e) => e.controlId === "A.5.15");
    expect(a515).toBeDefined();
    expect(a515!.source).toBe("keyword_suggestion");
    expect(a515!.reviewStatus).toBe("unreviewed");
    expect(a515!.matchReason).toMatch(/access control/i);
    // No numeric confidence anywhere in the reason.
    expect(a515!.matchReason).not.toMatch(/\d+%/);
  });

  it("does not match on stopword-only text", () => {
    const edges = suggestMappings(policy({ policyName: "The and or", policyDescription: "of for to in" }));
    expect(edges).toHaveLength(0);
  });

  it("does not match substring-inside-word (e.g. 'access' vs 'accessible')", () => {
    const edges = suggestMappings(policy({ policyName: "Accessibility statement", policyDescription: "Web accessibility." }));
    expect(edges.find((e) => e.controlId === "A.5.15")).toBeUndefined();
  });
});

describe("initialEdgesForPolicy", () => {
  it("prioritises declared refs over suggestions for the same control", () => {
    const p = policy({ policyDescription: "Access control policy. Explicit ref A.5.15." });
    const edges = initialEdgesForPolicy(p);
    const a515Edges = edges.filter((e) => e.controlId === "A.5.15");
    expect(a515Edges).toHaveLength(1);
    expect(a515Edges[0]!.source).toBe("user_declared_ref");
  });
});

describe("dedupeEdges", () => {
  it("keeps one edge per (policyId, controlId) and prefers higher-priority source", () => {
    const edges: MappingEdge[] = [
      { policyId: "p1", controlId: "A.5.1", source: "keyword_suggestion", reviewStatus: "unreviewed", matchReason: "k" },
      { policyId: "p1", controlId: "A.5.1", source: "user_declared_ref", reviewStatus: "unreviewed", matchReason: "u" },
      { policyId: "p1", controlId: "A.5.1", source: "manual_override", reviewStatus: "accepted", matchReason: "m" },
    ];
    const deduped = dedupeEdges(edges);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]!.source).toBe("manual_override");
  });
});

// ---------------------------------------------------------------------------
// WithDiagnostics variants — invalid-reference surfacing
// ---------------------------------------------------------------------------

describe("extractExplicitControlRefsWithDiagnostics", () => {
  it("still returns valid A.5.1 references", async () => {
    const { extractExplicitControlRefsWithDiagnostics } = await import("../mapper");
    const result = extractExplicitControlRefsWithDiagnostics(
      policy({ policyDescription: "Covers A.5.1 and A.8.2." }),
    );
    expect(result.refs).toEqual(["A.5.1", "A.8.2"]);
    expect(result.invalidRefs).toEqual([]);
  });

  it("reports A.5.99 as invalid without producing a valid ref", async () => {
    const { extractExplicitControlRefsWithDiagnostics } = await import("../mapper");
    const result = extractExplicitControlRefsWithDiagnostics(
      policy({ policyDescription: "Mentions A.5.99 here." }),
    );
    expect(result.refs).toEqual([]);
    expect(result.invalidRefs).toEqual(["A.5.99"]);
  });

  it("reports A.9.1 as invalid (unsupported family)", async () => {
    const { extractExplicitControlRefsWithDiagnostics } = await import("../mapper");
    const result = extractExplicitControlRefsWithDiagnostics(
      policy({ policyDescription: "References A.9.1." }),
    );
    expect(result.refs).toEqual([]);
    expect(result.invalidRefs).toEqual(["A.9.1"]);
  });

  it("deduplicates repeated invalid references", async () => {
    const { extractExplicitControlRefsWithDiagnostics } = await import("../mapper");
    const result = extractExplicitControlRefsWithDiagnostics(
      policy({ policyDescription: "A.5.99 then A.5.99 again." }),
    );
    expect(result.invalidRefs).toEqual(["A.5.99"]);
  });

  it("does not report ordinary numbers as invalid references", async () => {
    const { extractExplicitControlRefsWithDiagnostics } = await import("../mapper");
    const result = extractExplicitControlRefsWithDiagnostics(
      policy({ policyDescription: "See section 5.1 and 8.2 of the runbook." }),
    );
    expect(result.invalidRefs).toEqual([]);
    expect(result.refs).toEqual([]);
  });
});