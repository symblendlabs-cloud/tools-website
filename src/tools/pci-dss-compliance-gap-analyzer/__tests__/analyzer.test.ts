import { describe, it, expect } from "vitest";
import { analyzeYaml } from "../analyzer";

describe("analyzeYaml", () => {
  it("returns error for non-string input", () => {
    // @ts-expect-error - testing invalid type
    const result = analyzeYaml(null);
    expect(result.ok).toBe(false);
    expect(result.validationErrors[0]).toContain("Input must be a string");
  });

  it("rejects input exceeding 256 KB", () => {
    const raw = "a".repeat(256 * 1024 + 1);
    const result = analyzeYaml(raw);
    expect(result.ok).toBe(false);
    expect(result.validationErrors[0]).toContain("exceeds maximum size");
  });

  it("accepts input exactly at 256 KB", () => {
    // Create a valid YAML of exactly 256 KB
    const base = "schema_version: 1\nenvironment:\n  cde_defined: true\nbackup:\n  frequency: daily\n";
    const padding = "x".repeat(256 * 1024 - base.length - 13);
    const raw = base + "  note: " + padding + "\n";
    // Wait, backup doesn't have a note. Let's use a valid unknown property:
    const base2 = "schema_version: 1\nenvironment:\n  cde_defined: true\n";
    const padding2 = "x".repeat(256 * 1024 - base2.length - 12);
    const raw2 = base2 + "padding: " + padding2 + "\n"; // Unknown property at root generates warning, but is valid YAML and schema
    const result = analyzeYaml(raw2);
    expect(result.validationErrors.length).toBe(0);
    expect(result.ok).toBe(true);
  });

  it("rejects malformed YAML syntax", () => {
    const raw = "schema_version: [unclosed";
    const result = analyzeYaml(raw);
    expect(result.ok).toBe(false);
    expect(result.validationErrors[0]).toContain("YAML parse error");
  });

  it("rejects duplicate keys in YAML", () => {
    const raw = `
schema_version: 1
schema_version: 1
environment:
  cde_defined: true
`;
    const result = analyzeYaml(raw);
    expect(result.ok).toBe(false);
    // The yaml library throws "Map keys must be unique"
    expect(result.validationErrors[0]).toContain("Map keys must be unique");
  });

  it("rejects alias expansion attacks", () => {
    // Billion laughs style attack
    const raw = `
a: &a ["x","x","x","x","x","x","x","x","x","x"]
b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]
c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]
d: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]
e: &e [*d,*d,*d,*d,*d,*d,*d,*d,*d,*d]
schema_version: 1
environment:
  cde_defined: true
`;
    const result = analyzeYaml(raw);
    expect(result.ok).toBe(false);
    // Should be caught either as a parse error or exceeded alias limit
    expect(result.validationErrors.length).toBeGreaterThan(0);
    expect(result.validationErrors[0]).toContain("YAML parse error");
  });

  it("rejects non-object YAML root", () => {
    const raw = "- item1\n- item2";
    const result = analyzeYaml(raw);
    expect(result.ok).toBe(false);
    expect(result.validationErrors[0]).toContain("must be an object");
  });

  it("rejects excessive nesting depth", () => {
    // Create 12 levels of unique keys
    let nested = "schema_version: 1\nenvironment:\n  cde_defined: true\n";
    for (let i = 0; i < 12; i++) {
      nested += " ".repeat(i * 2) + `key${i}:\n`;
    }
    nested += " ".repeat(24) + "value: 1";

    const result = analyzeYaml(nested);
    expect(result.ok).toBe(false);
    expect(result.validationErrors[0]).toContain("nesting depth");
  });

  it("rejects missing schema_version", () => {
    const raw = "environment:\n  cde_defined: true";
    const result = analyzeYaml(raw);
    expect(result.ok).toBe(false);
    expect(result.validationErrors[0]).toContain("schema_version");
  });

  it("rejects invalid schema enum values", () => {
    const raw = `
schema_version: 1
environment:
  cde_defined: true
encryption:
  in_transit:
    tls_version: "1.5"
`;
    const result = analyzeYaml(raw);
    expect(result.ok).toBe(false);
    expect(result.validationErrors.some(e => e.includes("tls_version"))).toBe(true);
  });

  it("propagates unknown property warnings", () => {
    const raw = `
schema_version: 1
environment:
  cde_defined: true
  unknown_field: test
`;
    const result = analyzeYaml(raw);
    expect(result.ok).toBe(true);
    expect(result.warnings.some(w => w.includes("unknown_field"))).toBe(true);
  });

  it("does not run rules if schema validation fails", () => {
    const raw = "schema_version: 2\nenvironment:\n  cde_defined: true";
    const result = analyzeYaml(raw);
    expect(result.ok).toBe(false);
    expect(result.findings.length).toBe(0);
  });

  it("runs all rules on valid input", () => {
    const raw = `
schema_version: 1
environment:
  cde_defined: true
network_security:
  cde_inbound_rules:
    - source: "0.0.0.0/0"
      port: 443
      protocol: tcp
encryption:
  in_transit:
    tls_version: "1.2"
    cipher_suites:
      - TLS_AES_256_GCM_SHA384
`;
    const result = analyzeYaml(raw);
    expect(result.ok).toBe(true);
    // 10 rules in ALL_RULES
    expect(result.findings.length).toBe(10);
    // Ensure no forbidden statuses
    for (const f of result.findings) {
      expect(["gap", "evidence-present", "manual", "insufficient", "not-evaluated"]).toContain(f.status);
      expect(f.status).not.toMatch(/compliant|certified/);
    }
  });

  it("returns error for empty input", () => {
    const result = analyzeYaml("");
    expect(result.ok).toBe(false);
    expect(result.validationErrors.length).toBeGreaterThan(0);
  });
});