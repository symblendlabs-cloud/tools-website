import { describe, it, expect } from "vitest";
import {
  validateSchema,
  checkInputSize,
  checkNestingDepth,
  type AnalyzerInput,
} from "../schema";

describe("checkInputSize", () => {
  it("accepts input exactly at the 256 KB limit", () => {
    const raw = "a".repeat(256 * 1024);
    expect(checkInputSize(raw)).toBeNull();
  });

  it("rejects input exceeding the 256 KB limit", () => {
    const raw = "a".repeat(256 * 1024 + 1);
    expect(checkInputSize(raw)).toContain("exceeds maximum size");
  });
});

describe("checkNestingDepth", () => {
  it("accepts nesting at depth 10", () => {
    let obj: any = {};
    let current = obj;
    for (let i = 0; i < 9; i++) {
      current.a = {};
      current = current.a;
    }
    expect(checkNestingDepth(obj)).toBeNull();
  });

  it("rejects nesting deeper than 10", () => {
    let obj: any = {};
    let current = obj;
    for (let i = 0; i < 11; i++) {
      current.a = {};
      current = current.a;
    }
    expect(checkNestingDepth(obj)).toContain("exceeds maximum nesting depth");
  });
});

describe("validateSchema", () => {
  it("validates a valid minimal schema", () => {
    const input: AnalyzerInput = {
      schema_version: 1,
      environment: { cde_defined: true },
    };
    const result = validateSchema(input);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects missing schema_version", () => {
    const result = validateSchema({ environment: { cde_defined: true } });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing required field: schema_version.");
  });

  it("rejects unsupported schema version", () => {
    const result = validateSchema({ schema_version: 2, environment: { cde_defined: true } });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Unsupported schema_version: 2");
  });

  it("rejects missing environment.cde_defined", () => {
    const result = validateSchema({ schema_version: 1, environment: {} });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing required field: environment.cde_defined.");
  });

  it("rejects invalid enum values", () => {
    const result = validateSchema({
      schema_version: 1,
      environment: { cde_defined: true },
      encryption: { in_transit: { tls_version: "1.5" } },
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Invalid enum value for encryption.in_transit.tls_version");
  });

  it("accepts unknown properties with warnings", () => {
    const result = validateSchema({
      schema_version: 1,
      environment: { cde_defined: true, unknown_field: "test" },
    });
    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("Unknown property: environment.unknown_field");
  });

  it("does not crash on malformed values", () => {
    const result = validateSchema({ schema_version: 1, environment: { cde_defined: true }, logging: { destinations: [null, "string", 123] } });
    expect(result).toBeDefined();
    expect(result.ok).toBeDefined();
  });
});