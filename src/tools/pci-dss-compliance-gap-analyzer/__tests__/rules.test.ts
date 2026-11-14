import { describe, it, expect } from "vitest";
import { ALL_RULES, rule_1_2_7, rule_1_3_1, rule_1_3_2, rule_4_2_1, rule_8_3_6, rule_8_4_2, rule_10_4_1, rule_10_5_1, rule_11_3_1, rule_11_3_2 } from "../rules";
import type { AnalyzerInput } from "../schema";

const base: AnalyzerInput = {
  schema_version: 1,
  environment: { cde_defined: true },
};

describe("Semantic guards", () => {
  it("no rule returns a compliance claim or score", () => {
    for (const rule of ALL_RULES) {
      const result = rule.evaluate(base);
      expect(result.status).not.toMatch(/compliant|certified|score|%/i);
      expect(["gap", "evidence-present", "manual", "insufficient", "not-evaluated"]).toContain(result.status);
    }
  });
});

describe("1.2.7 Review Frequency", () => {
  it("returns gap when > 180 days", () => {
    const input = { ...base, network_security: { rule_review_frequency_days: 181 } };
    expect(rule_1_2_7.evaluate(input).status).toBe("gap");
  });
  it("returns evidence-present when <= 180 days", () => {
    const input = { ...base, network_security: { rule_review_frequency_days: 180 } };
    expect(rule_1_2_7.evaluate(input).status).toBe("evidence-present");
  });
  it("returns manual when absent", () => {
    expect(rule_1_2_7.evaluate(base).status).toBe("manual");
  });
});

describe("1.3.1 Inbound Rules", () => {
  it("returns insufficient when undefined", () => {
    expect(rule_1_3_1.evaluate(base).status).toBe("insufficient");
  });
  it("returns gap when empty and default_deny false", () => {
    const input = { ...base, network_security: { cde_inbound_rules: [], default_deny: false } };
    expect(rule_1_3_1.evaluate(input).status).toBe("gap");
  });
  it("returns manual when empty and default_deny true", () => {
    const input = { ...base, network_security: { cde_inbound_rules: [], default_deny: true } };
    expect(rule_1_3_1.evaluate(input).status).toBe("manual");
  });
  it("returns evidence-present when complete rules", () => {
    const input = { ...base, network_security: { cde_inbound_rules: [{ source: "1.1.1.1", port: 80, protocol: "tcp" as const }] } };
    expect(rule_1_3_1.evaluate(input).status).toBe("evidence-present");
  });
  it("returns manual when incomplete rules", () => {
    const input = { ...base, network_security: { cde_inbound_rules: [{ source: "1.1.1.1" }] } };
    expect(rule_1_3_1.evaluate(input).status).toBe("manual");
  });
});

describe("1.3.2 Outbound Rules", () => {
  it("returns insufficient when undefined", () => {
    expect(rule_1_3_2.evaluate(base).status).toBe("insufficient");
  });
  it("returns gap when empty and default_deny false", () => {
    const input = { ...base, network_security: { cde_outbound_rules: [], default_deny: false } };
    expect(rule_1_3_2.evaluate(input).status).toBe("gap");
  });
  it("returns evidence-present when complete rules", () => {
    const input = { ...base, network_security: { cde_outbound_rules: [{ destination: "1.1.1.1", port: 80, protocol: "tcp" as const }] } };
    expect(rule_1_3_2.evaluate(input).status).toBe("evidence-present");
  });
});

describe("4.2.1 TLS", () => {
  it("returns insufficient when undefined", () => {
    expect(rule_4_2_1.evaluate(base).status).toBe("insufficient");
  });
  it("returns gap for TLS 1.1", () => {
    const input = { ...base, encryption: { in_transit: { tls_version: "1.1" as const } } };
    expect(rule_4_2_1.evaluate(input).status).toBe("gap");
  });
  it("returns manual for TLS 1.2 without ciphers", () => {
    const input = { ...base, encryption: { in_transit: { tls_version: "1.2" as const } } };
    expect(rule_4_2_1.evaluate(input).status).toBe("manual");
  });
  it("returns evidence-present for TLS 1.3 with ciphers", () => {
    const input = { ...base, encryption: { in_transit: { tls_version: "1.3" as const, cipher_suites: ["TLS_AES_256_GCM_SHA384"] } } };
    expect(rule_4_2_1.evaluate(input).status).toBe("evidence-present");
  });
});

describe("8.3.6 Password Complexity", () => {
  it("returns insufficient when undefined", () => {
    expect(rule_8_3_6.evaluate(base).status).toBe("insufficient");
  });
  it("returns gap for numeric-only", () => {
    const input = { ...base, authentication: { user_accounts: { password_min_length: 12, password_composition: "numeric-only" as const } } };
    expect(rule_8_3_6.evaluate(input).status).toBe("gap");
  });
  it("returns gap for length < 8", () => {
    const input = { ...base, authentication: { user_accounts: { password_min_length: 7, password_composition: "alphanumeric" as const } } };
    expect(rule_8_3_6.evaluate(input).status).toBe("gap");
  });
  it("returns manual for length 8-11 with exception", () => {
    const input = { ...base, authentication: { user_accounts: { password_min_length: 10, password_composition: "alphanumeric" as const, password_system_exception_documented: true } } };
    expect(rule_8_3_6.evaluate(input).status).toBe("manual");
  });
  it("returns evidence-present for length >= 12", () => {
    const input = { ...base, authentication: { user_accounts: { password_min_length: 12, password_composition: "alphanumeric" as const } } };
    expect(rule_8_3_6.evaluate(input).status).toBe("evidence-present");
  });
});

describe("8.4.2 MFA", () => {
  it("returns insufficient when undefined", () => {
    expect(rule_8_4_2.evaluate(base).status).toBe("insufficient");
  });
  it("returns gap for missing MFA without exception", () => {
    const input = { ...base, authentication: { cde_non_console_access_paths: [{ id: "1", description: "test", mfa_enabled: false }] } };
    expect(rule_8_4_2.evaluate(input).status).toBe("gap");
  });
  it("returns manual for exception", () => {
    const input = { ...base, authentication: { cde_non_console_access_paths: [{ id: "1", description: "test", mfa_enabled: false, exception_reason: "phishing-resistant-auth-only" as const }] } };
    expect(rule_8_4_2.evaluate(input).status).toBe("manual");
  });
  it("returns evidence-present for all MFA true", () => {
    const input = { ...base, authentication: { cde_non_console_access_paths: [{ id: "1", description: "test", mfa_enabled: true }] } };
    expect(rule_8_4_2.evaluate(input).status).toBe("evidence-present");
  });
});

describe("10.4.1 Log Review", () => {
  it("returns insufficient when undefined", () => {
    expect(rule_10_4_1.evaluate(base).status).toBe("insufficient");
  });
  it("returns gap for weekly", () => {
    const input = { ...base, logging: { review_frequency: "weekly" as const } };
    expect(rule_10_4_1.evaluate(input).status).toBe("gap");
  });
  it("returns manual for daily", () => {
    const input = { ...base, logging: { review_frequency: "daily" as const } };
    expect(rule_10_4_1.evaluate(input).status).toBe("manual");
  });
});

describe("10.5.1 Log Retention", () => {
  it("returns insufficient when undefined", () => {
    expect(rule_10_5_1.evaluate(base).status).toBe("insufficient");
  });
  it("returns manual when no CDE destinations", () => {
    const input = { ...base, logging: { destinations: [{ type: "siem" as const, retention_months: 12, immediately_available_months: 3 }] } };
    expect(rule_10_5_1.evaluate(input).status).toBe("manual");
  });
  it("returns gap for insufficient retention", () => {
    const input = { ...base, logging: { destinations: [{ type: "siem" as const, covers_cde_systems: true, retention_months: 11, immediately_available_months: 3 }] } };
    expect(rule_10_5_1.evaluate(input).status).toBe("gap");
  });
  it("returns evidence-present for valid retention", () => {
    const input = { ...base, logging: { destinations: [{ type: "siem" as const, covers_cde_systems: true, retention_months: 12, immediately_available_months: 3 }] } };
    expect(rule_10_5_1.evaluate(input).status).toBe("evidence-present");
  });
});

describe("11.3.1 Internal Scan", () => {
  it("returns insufficient when undefined", () => {
    expect(rule_11_3_1.evaluate(base).status).toBe("insufficient");
  });
  it("returns gap for > 90 days", () => {
    const input = { ...base, vulnerability_management: { internal_scan_frequency_days: 91 } };
    expect(rule_11_3_1.evaluate(input).status).toBe("gap");
  });
  it("returns manual for <= 90 days", () => {
    const input = { ...base, vulnerability_management: { internal_scan_frequency_days: 90 } };
    expect(rule_11_3_1.evaluate(input).status).toBe("manual");
  });
});

describe("11.3.2 External Scan", () => {
  it("returns insufficient when undefined", () => {
    expect(rule_11_3_2.evaluate(base).status).toBe("insufficient");
  });
  it("returns gap for > 90 days", () => {
    const input = { ...base, vulnerability_management: { external_scan_frequency_days: 91 } };
    expect(rule_11_3_2.evaluate(input).status).toBe("gap");
  });
  it("returns manual when no ASV", () => {
    const input = { ...base, vulnerability_management: { external_scan_frequency_days: 90 } };
    expect(rule_11_3_2.evaluate(input).status).toBe("manual");
  });
});