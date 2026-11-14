// src/tools/pci-dss-compliance-gap-analyzer/schema.ts

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface Environment {
  name?: string;
  description?: string;
  cde_defined: boolean;
  cde_zones?: Array<{
    id: string;
    name: string;
    type: "vpc" | "subnet" | "vlan" | "zone" | "other";
    network_cidrs?: string[];
  }>;
  non_cde_zones?: Array<{
    id: string;
    name: string;
    type: "corporate" | "guest" | "dev" | "other";
  }>;
}

export interface NetworkSecurity {
  default_deny?: boolean;
  cde_inbound_rules?: Array<{
    source?: string;
    port?: number | string;
    protocol?: "tcp" | "udp" | "icmp" | "any";
    justification?: string;
  }>;
  cde_outbound_rules?: Array<{
    destination?: string;
    port?: number | string;
    protocol?: "tcp" | "udp" | "icmp" | "any";
    justification?: string;
  }>;
  rule_review_frequency_days?: number;
}

export interface Encryption {
  at_rest?: {
    enabled?: boolean;
    algorithm?: "aes-256" | "aes-128" | "other";
    key_rotation_days?: number;
  };
  in_transit?: {
    tls_version?: "1.0" | "1.1" | "1.2" | "1.3" | "ssl" | "other";
    cipher_suites?: string[];
    fallback_to_insecure?: boolean;
  };
}

export interface Authentication {
  cde_non_console_access_paths?: Array<{
    id: string;
    description: string;
    mfa_enabled: boolean;
    exception_reason?: "phishing-resistant-auth-only" | null;
  }>;
  user_accounts?: {
    password_min_length?: number;
    password_composition?: "alphanumeric" | "numeric-only" | "alphabetic-only" | "unknown";
    password_system_exception_documented?: boolean;
  };
  application_accounts?: Array<{
    id: string;
    password_policy_defined: boolean;
  }>;
}

export interface Logging {
  destinations?: Array<{
    type?: "siem" | "syslog" | "file" | "cloud";
    retention_months?: number;
    immediately_available_months?: number;
    covers_cde_systems?: boolean;
  }>;
  review_frequency?: "daily" | "weekly" | "monthly" | "none";
  log_integrity_monitoring?: boolean;
}

export interface VulnerabilityManagement {
  internal_scan_frequency_days?: number;
  internal_rescan_policy?: string;
  external_scan_frequency_days?: number;
  asv_provider?: string;
}

export interface Backup {
  enabled?: boolean;
  encryption_enabled?: boolean;
  frequency?: "daily" | "weekly" | "monthly" | "other";
}

export interface AnalyzerInput {
  schema_version: 1;
  environment?: Environment;
  network_security?: NetworkSecurity;
  encryption?: Encryption;
  authentication?: Authentication;
  logging?: Logging;
  vulnerability_management?: VulnerabilityManagement;
  backup?: Backup;
}

// --- Safety Helpers ---

export function checkInputSize(raw: string): string | null {
  const bytes = new TextEncoder().encode(raw).length;
  if (bytes > 256 * 1024) {
    return `Input exceeds maximum size of 256 KB (received ${bytes} bytes).`;
  }
  return null;
}

export function checkNestingDepth(obj: unknown, currentDepth = 0): string | null {
  if (currentDepth > 10) {
    return "Input exceeds maximum nesting depth of 10 levels.";
  }
  if (obj && typeof obj === "object") {
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const err = checkNestingDepth(item, currentDepth + 1);
        if (err) return err;
      }
    } else {
      for (const key of Object.keys(obj)) {
        const err = checkNestingDepth((obj as Record<string, unknown>)[key], currentDepth + 1);
        if (err) return err;
      }
    }
  }
  return null;
}

// --- Validator ---

const KNOWN_KEYS: Record<string, string[]> = {
  root: ["schema_version", "environment", "network_security", "encryption", "authentication", "logging", "vulnerability_management", "backup"],
  environment: ["name", "description", "cde_defined", "cde_zones", "non_cde_zones"],
  cde_zones: ["id", "name", "type", "network_cidrs"],
  non_cde_zones: ["id", "name", "type"],
  network_security: ["default_deny", "cde_inbound_rules", "cde_outbound_rules", "rule_review_frequency_days"],
  cde_inbound_rules: ["source", "port", "protocol", "justification"],
  cde_outbound_rules: ["destination", "port", "protocol", "justification"],
  encryption: ["at_rest", "in_transit"],
  at_rest: ["enabled", "algorithm", "key_rotation_days"],
  in_transit: ["tls_version", "cipher_suites", "fallback_to_insecure"],
  authentication: ["cde_non_console_access_paths", "user_accounts", "application_accounts"],
  cde_non_console_access_paths: ["id", "description", "mfa_enabled", "exception_reason"],
  user_accounts: ["password_min_length", "password_composition", "password_system_exception_documented"],
  application_accounts: ["id", "password_policy_defined"],
  logging: ["destinations", "review_frequency", "log_integrity_monitoring"],
  destinations: ["type", "retention_months", "immediately_available_months", "covers_cde_systems"],
  vulnerability_management: ["internal_scan_frequency_days", "internal_rescan_policy", "external_scan_frequency_days", "asv_provider"],
  backup: ["enabled", "encryption_enabled", "frequency"],
};

const ENUMS: Record<string, string[]> = {
  "environment.cde_zones[].type": ["vpc", "subnet", "vlan", "zone", "other"],
  "environment.non_cde_zones[].type": ["corporate", "guest", "dev", "other"],
  "network_security.cde_inbound_rules[].protocol": ["tcp", "udp", "icmp", "any"],
  "network_security.cde_outbound_rules[].protocol": ["tcp", "udp", "icmp", "any"],
  "encryption.at_rest.algorithm": ["aes-256", "aes-128", "other"],
  "encryption.in_transit.tls_version": ["1.0", "1.1", "1.2", "1.3", "ssl", "other"],
  "authentication.cde_non_console_access_paths[].exception_reason": ["phishing-resistant-auth-only", null as any],
  "authentication.user_accounts.password_composition": ["alphanumeric", "numeric-only", "alphabetic-only", "unknown"],
  "logging.destinations[].type": ["siem", "syslog", "file", "cloud"],
  "logging.review_frequency": ["daily", "weekly", "monthly", "none"],
  "backup.frequency": ["daily", "weekly", "monthly", "other"],
};

export function validateSchema(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["Input must be a YAML object."], warnings: [] };
  }

  const obj = input as Record<string, unknown>;

  // Check schema_version
  if (obj.schema_version === undefined) {
    errors.push("Missing required field: schema_version.");
  } else if (obj.schema_version !== 1) {
    errors.push(`Unsupported schema_version: ${obj.schema_version}. Must be 1.`);
  }

  // Traverse and validate
  function walk(current: unknown, path: string, contextKey: string) {
    if (current === null || current === undefined) return;

    const expectedKeys = KNOWN_KEYS[contextKey] || [];

    if (typeof current === "object" && !Array.isArray(current)) {
      for (const key of Object.keys(current)) {
        const childPath = path ? `${path}.${key}` : key;
        if (expectedKeys.length > 0 && !expectedKeys.includes(key)) {
          warnings.push(`Unknown property: ${childPath}`);
        } else {
          walk((current as Record<string, unknown>)[key], childPath, key);
        }
      }
    } else if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        walk(current[i], `${path}[${i}]`, contextKey.replace("[]", ""));
      }
    } else {
      // Primitive validation
      const enumValues = ENUMS[path.replace(/\[\d+\]/g, "[]")];
      if (enumValues && !enumValues.includes(current as string)) {
        errors.push(`Invalid enum value for ${path}: "${current}". Allowed: ${enumValues.join(", ")}`);
      }
    }
  }

  // Enforce required fields manually
  if (obj.environment && typeof obj.environment === "object") {
    if ((obj.environment as Record<string, unknown>).cde_defined === undefined) {
      errors.push("Missing required field: environment.cde_defined.");
    }
  }

  walk(obj, "", "root");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}