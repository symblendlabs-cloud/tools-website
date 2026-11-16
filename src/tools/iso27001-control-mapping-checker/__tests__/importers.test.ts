// src/tools/iso27001-control-mapping-checker/__tests__/importers.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { importCsv } from "../importers";
import { LIMITS } from "../schema";

vi.mock("../workers/xlsx-parser.client", () => {
  return {
    parseXlsxInWorker: vi.fn(),
    // Re-export types loosely for the test
  };
});

describe("importCsv", () => {
  it("parses a valid CSV with required columns", () => {
    const csv = "policy name,description\nAccess Policy,Defines access control.";
    const r = importCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.policies).toHaveLength(1);
    expect(r.policies[0]!.policyName).toBe("Access Policy");
    expect(r.policies[0]!.policyId).toBe("imported-row-2-1");
  });

  it("respects quoted commas and escaped quotes", () => {
    const csv = 'policy name,description\nA,"uses ""quoted"" text, with comma"';
    const r = importCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.policies[0]!.policyDescription).toContain("quoted");
    expect(r.policies[0]!.policyDescription).toContain(",");
  });

  it("errors when required columns are missing", () => {
    const csv = "foo,bar\n1,2";
    const r = importCsv(csv);
    expect(r.ok).toBe(true); // parsing succeeds; normalization emits diagnostics
    if (!r.ok) return;
    expect(r.policies).toHaveLength(0);
    expect(r.diagnostics.some((d) => /required column/i.test(d.message))).toBe(true);
  });

  it("errors on empty CSV", () => {
    const r = importCsv("");
    expect(r.ok).toBe(false);
  });

  it("rejects CSV larger than the size limit", () => {
    const big = "a".repeat(LIMITS.maxFileBytes + 1);
    const r = importCsv(big);
    expect(r.ok).toBe(false);
  });

  it("deduplicates by policy id", () => {
    const csv = "policy id,policy name,description\nP1,Name A,Desc A\nP1,Name B,Desc B";
    const r = importCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.policies).toHaveLength(1);
    expect(r.diagnostics.some((d) => /duplicate/i.test(d.message))).toBe(true);
  });

  it("warns but keeps row when optional fields are missing", () => {
    const csv = "policy name,description\nOnly Name,Only Description";
    const r = importCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.policies).toHaveLength(1);
  });
});

describe("importXlsx integration (via mocked client)", () => {
  beforeEach(() => vi.resetModules());

  it("returns failure when the worker client reports failure", async () => {
    const mod = await import("../workers/xlsx-parser.client");
    (mod.parseXlsxInWorker as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      error: "boom",
    });
    const { importXlsx } = await import("../importers");
    const r = await importXlsx(new Uint8Array([1, 2, 3]).buffer);
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CSV regressions — newline, delimiter variants, invalid ref diagnostics
// ---------------------------------------------------------------------------

describe("importCsv — delimiter and quoted-field handling", () => {
  it("preserves a newline inside a quoted field", () => {
    const csv = 'policy name,description\nA,"Line one\nLine two"';
    const r = importCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.policies).toHaveLength(1);
    expect(r.policies[0]!.policyDescription).toContain("Line one");
    expect(r.policies[0]!.policyDescription).toContain("Line two");
  });

  it("auto-detects tab-delimited input", () => {
    const tsv = "policy name\tdescription\nA\tAccess control policy";
    const r = importCsv(tsv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.policies).toHaveLength(1);
    expect(r.policies[0]!.policyName).toBe("A");
  });

  it("auto-detects semicolon-delimited input", () => {
    const semi = "policy name;description\nA;Access control policy";
    const r = importCsv(semi);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.policies).toHaveLength(1);
    expect(r.policies[0]!.policyName).toBe("A");
  });
});

describe("importCsv — invalid control reference diagnostics", () => {
  it("surfaces a warning when a policy contains an invalid Annex A reference", () => {
    const csv = "policy name,description\nA,Covers A.5.99 requirements.";
    const r = importCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const invalidDiag = r.diagnostics.find((d) => d.message.includes("A.5.99"));
    expect(invalidDiag).toBeDefined();
    expect(invalidDiag!.severity).toBe("warning");
  });

  it("does not produce a mapping edge for an invalid reference", async () => {
    const { initialEdgesForPolicyWithDiagnostics } = await import("../mapper");
    const policy = {
      policyId: "p1",
      policyName: "A",
      policyDescription: "Covers A.5.99 requirements.",
    };
    const { edges, invalidRefs } = initialEdgesForPolicyWithDiagnostics(policy);
    expect(invalidRefs).toEqual(["A.5.99"]);
    expect(edges.some((e) => e.controlId === "A.5.99")).toBe(false);
  });
});