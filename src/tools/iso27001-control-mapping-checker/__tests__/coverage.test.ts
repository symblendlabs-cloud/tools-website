// src/tools/iso27001-control-mapping-checker/__tests__/coverage.test.ts
import { describe, it, expect } from "vitest";
import { defaultApplicability } from "../applicability";
import { computeCoverage } from "../coverage";
import type { ApplicabilityDecision, MappingEdge } from "../types";

function applyState(
  map: Record<string, ApplicabilityDecision>,
  ids: string[],
  state: ApplicabilityDecision["state"],
): Record<string, ApplicabilityDecision> {
  const next = { ...map };
  for (const id of ids) next[id] = { controlId: id, state, justification: state === "not_applicable" ? "x" : undefined };
  return next;
}

const accepted = (controlId: string, policyId = "p1"): MappingEdge => ({
  policyId,
  controlId,
  source: "keyword_suggestion",
  reviewStatus: "accepted",
  matchReason: "test",
});

describe("computeCoverage", () => {
  it("returns N/A when no controls are applicable", () => {
    const result = computeCoverage(defaultApplicability(), []);
    expect(result.percent).toBeNull();
    expect(result.counts.applicable).toBe(0);
    expect(result.counts.notAssessed).toBe(93);
  });

  it("excludes not_assessed and not_applicable from the denominator", () => {
    let map = defaultApplicability();
    map = applyState(map, ["A.5.1", "A.5.2"], "applicable");
    map = applyState(map, ["A.5.3"], "not_applicable");
    const r = computeCoverage(map, []);
    expect(r.counts.applicable).toBe(2);
    expect(r.counts.notApplicable).toBe(1);
    expect(r.counts.notAssessed).toBe(90);
    expect(r.percent).toBe(0);
  });

  it("counts accepted mappings only, and only once per control", () => {
    let map = defaultApplicability();
    map = applyState(map, ["A.5.1", "A.5.2"], "applicable");
    const edges: MappingEdge[] = [accepted("A.5.1", "p1"), accepted("A.5.1", "p2")];
    const r = computeCoverage(map, edges);
    expect(r.counts.applicableWithAccepted).toBe(1);
    expect(r.percent).toBe(50);
  });

  it("excludes suggested and rejected mappings", () => {
    let map = defaultApplicability();
    map = applyState(map, ["A.5.1"], "applicable");
    const edges: MappingEdge[] = [
      { policyId: "p1", controlId: "A.5.1", source: "keyword_suggestion", reviewStatus: "unreviewed", matchReason: "t" },
      { policyId: "p1", controlId: "A.5.1", source: "keyword_suggestion", reviewStatus: "rejected", matchReason: "t" },
    ];
    const r = computeCoverage(map, edges);
    expect(r.counts.applicableWithAccepted).toBe(0);
    expect(r.counts.suggestionsAwaitingReview).toBe(1);
    expect(r.counts.rejectedMappings).toBe(1);
    expect(r.percent).toBe(0);
  });

  it("calculates per-theme percentages", () => {
    let map = defaultApplicability();
    map = applyState(map, ["A.5.1", "A.6.1"], "applicable");
    const r = computeCoverage(map, [accepted("A.5.1")]);
    expect(r.byTheme.organizational.percent).toBe(100);
    expect(r.byTheme.people.percent).toBe(0);
    expect(r.byTheme.physical.percent).toBeNull();
    expect(r.byTheme.technological.percent).toBeNull();
  });
});
