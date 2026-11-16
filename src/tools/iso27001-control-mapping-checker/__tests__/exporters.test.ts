// src/tools/iso27001-control-mapping-checker/__tests__/exporters.test.ts
import { describe, it, expect } from "vitest";
import {
  buildMappingCsv,
  buildProjectJson,
  buildSoaCsv,
  guardFormula,
} from "../exporters";
import { defaultApplicability } from "../applicability";
import type { AssessmentData, MappingEdge, PolicyRecord } from "../types";

function sampleData(overrides: Partial<AssessmentData> = {}): AssessmentData {
  const policies: PolicyRecord[] = [
    { policyId: "P1", policyName: "Access Policy", policyDescription: "Covers A.5.15." },
  ];
  const applicability = { ...defaultApplicability() };
  applicability["A.5.15"] = { controlId: "A.5.15", state: "applicable" };
  const mappings: MappingEdge[] = [
    {
      policyId: "P1",
      controlId: "A.5.15",
      source: "user_declared_ref",
      reviewStatus: "accepted",
      matchReason: "Explicit Annex A reference",
    },
  ];
  return { policies, applicability, mappings, implementations: {}, ...overrides };
}

describe("guardFormula", () => {
  it("prefixes values starting with = + - @", () => {
    expect(guardFormula("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(guardFormula("+1")).toBe("'+1");
    expect(guardFormula("-1")).toBe("'-1");
    expect(guardFormula("@cmd")).toBe("'@cmd");
  });

  it("prefixes after leading whitespace", () => {
    expect(guardFormula("  =SUM(A1)")).toBe("'  =SUM(A1)");
  });

  it("leaves normal text alone", () => {
    expect(guardFormula("Access Policy")).toBe("Access Policy");
    expect(guardFormula("")).toBe("");
  });
});

describe("buildProjectJson", () => {
  it("round-trips via JSON.parse and preserves standard metadata", () => {
    const data = sampleData();
    const json = buildProjectJson(data);
    const parsed = JSON.parse(json);
    expect(parsed.standard.id).toMatch(/ISO\/IEC 27001:2022/);
    expect(parsed.policies).toHaveLength(1);
    expect(parsed.mappings).toHaveLength(1);
    expect(parsed.coverage.percent).toBe(100);
  });
});

describe("buildMappingCsv", () => {
  it("emits a header and one row per mapping", () => {
    const csv = buildMappingCsv(sampleData());
    const lines = csv.split(/\r?\n/).filter(Boolean);
    expect(lines[0]).toMatch(/policy_id,policy_name/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("P1");
    expect(lines[1]).toContain("A.5.15");
  });

  it("guards formula-like values", () => {
    const data = sampleData({
      policies: [{ policyId: "=BAD", policyName: "=1+1", policyDescription: "x" }],
      mappings: [
        {
          policyId: "=BAD",
          controlId: "A.5.15",
          source: "user_declared_ref",
          reviewStatus: "accepted",
          matchReason: "=HYPERLINK()",
        },
      ],
    });
    const csv = buildMappingCsv(data);
    expect(csv).toContain("'=BAD");
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'=HYPERLINK()");
  });
});

describe("buildSoaCsv", () => {
  it("contains all 93 controls, including not-assessed and not-applicable", () => {
    const csv = buildSoaCsv(sampleData());
    const lines = csv.split(/\r?\n/).filter(Boolean);
    expect(lines.length).toBe(94); // header + 93 controls
    expect(csv).toContain("A.5.1");
    expect(csv).toContain("A.8.34");
    // A.5.15 was marked applicable, all others remain not_assessed
    expect(csv).toContain("not_assessed");
  });

  it("includes exclusion justification for a not_applicable control", () => {
    const applicability = { ...defaultApplicability() };
    applicability["A.5.1"] = {
      controlId: "A.5.1",
      state: "not_applicable",
      justification: "Out of scope for our business.",
    };
    const csv = buildSoaCsv(sampleData({ applicability }));
    expect(csv).toContain("Out of scope for our business.");
  });
});

// ---------------------------------------------------------------------------
// SoA review-info columns
// ---------------------------------------------------------------------------

describe("buildSoaCsv — review information", () => {
  it("includes mapping_sources, review_statuses and match_reasons in the header", () => {
    const csv = buildSoaCsv(sampleData());
    const header = csv.split(/\r?\n/)[0]!;
    expect(header).toContain("mapping_sources");
    expect(header).toContain("review_statuses");
    expect(header).toContain("match_reasons");
  });

  it("includes per-edge review info for accepted mappings", () => {
    const csv = buildSoaCsv(sampleData());
    // sampleData has P1 → A.5.15 with accepted user_declared_ref
    const lines = csv.split(/\r?\n/);
    const a515Row = lines.find((l) => l.includes("A.5.15"));
    expect(a515Row).toBeDefined();
    expect(a515Row).toContain("P1:user_declared_ref");
    expect(a515Row).toContain("P1:accepted");
  });

  it("aggregates multiple edges per control with deterministic ordering", () => {
    const data = sampleData({
      mappings: [
        { policyId: "P2", controlId: "A.5.15", source: "keyword_suggestion", reviewStatus: "accepted", matchReason: "reason B" },
        { policyId: "P1", controlId: "A.5.15", source: "user_declared_ref", reviewStatus: "unreviewed", matchReason: "reason A" },
      ],
    });
    const csv = buildSoaCsv(data);
    const a515 = csv.split(/\r?\n/).find((l) => l.includes("A.5.15"))!;
    // P1 sorts before P2
    const p1Pos = a515.indexOf("P1:");
    const p2Pos = a515.indexOf("P2:");
    expect(p1Pos).toBeGreaterThan(-1);
    expect(p2Pos).toBeGreaterThan(-1);
    expect(p1Pos).toBeLessThan(p2Pos);
  });

  it("still contains all 93 controls after adding the new columns", () => {
    const csv = buildSoaCsv(sampleData());
    const dataLines = csv.split(/\r?\n/).filter(Boolean).slice(1);
    expect(dataLines.length).toBe(93);
  });

  it("guards formula-like values in the new columns", () => {
    const data = sampleData({
      mappings: [
        { policyId: "=BAD", controlId: "A.5.15", source: "user_declared_ref", reviewStatus: "accepted", matchReason: "=HYPERLINK()" },
      ],
    });
    const csv = buildSoaCsv(data);
    expect(csv).toContain("'=BAD:");
    expect(csv).toContain(":=HYPERLINK()");
  });
});