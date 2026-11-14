import type { AnalyzerInput } from "./schema";

export type RuleStatus =
  | "gap"
  | "evidence-present"
  | "manual"
  | "insufficient"
  | "not-evaluated";

export interface RuleResult {
  status: RuleStatus;
  evidence: string;
  remediation: string;
  officialRef: string;
}

export interface Rule {
  id: string;
  requirement: string;
  description: string;
  evaluate: (input: AnalyzerInput) => RuleResult;
}

const REF = "https://www.pcisecuritystandards.org/document_library/";

// ----------------------------------------------------------------------
// 1.2.7 — Network security control configurations reviewed at least once every six months
// ----------------------------------------------------------------------
export const rule_1_2_7: Rule = {
  id: "REVIEW-FREQ",
  requirement: "1.2.7",
  description:
    "Network security control configurations reviewed at least once every six months.",
  evaluate: (input) => {
    const days = input.network_security?.rule_review_frequency_days;
    if (days === undefined) {
      return {
        status: "manual",
        evidence: "Review frequency not declared.",
        remediation: "Declare rule_review_frequency_days under network_security.",
        officialRef: REF,
      };
    }
    if (days > 180) {
      return {
        status: "gap",
        evidence: `Declared review frequency is ${days} days, exceeding the 180-day maximum.`,
        remediation: "Review network rules at least once every 180 days.",
        officialRef: REF,
      };
    }
    return {
      status: "evidence-present",
      evidence: `Review frequency declared as ${days} days.`,
      remediation: "Ensure reviews actually occur and are documented.",
      officialRef: REF,
    };
  },
};

// ----------------------------------------------------------------------
// 1.3.1 — Inbound traffic to the CDE restricted to necessary traffic
// ----------------------------------------------------------------------
export const rule_1_3_1: Rule = {
  id: "INBOUND-RULES",
  requirement: "1.3.1",
  description:
    "Inbound traffic to the CDE restricted to only necessary traffic; all other traffic denied.",
  evaluate: (input) => {
    const rules = input.network_security?.cde_inbound_rules;
    const defaultDeny = input.network_security?.default_deny;

    if (!rules) {
      return {
        status: "insufficient",
        evidence: "No inbound rules declared.",
        remediation: "Declare cde_inbound_rules to document permitted inbound traffic.",
        officialRef: REF,
      };
    }

    if (rules.length === 0) {
      if (defaultDeny === true) {
        return {
          status: "manual",
          evidence: "Default deny is true, but no explicit inbound rules are documented.",
          remediation: "Verify no unauthorized inbound paths exist.",
          officialRef: REF,
        };
      }
      return {
        status: "gap",
        evidence: "No inbound rules are documented, and default_deny is not true.",
        remediation: "Document permitted inbound rules and enforce default deny.",
        officialRef: REF,
      };
    }

    const incomplete = rules.some((r) => !r.source || !r.port || !r.protocol);
    if (incomplete) {
      return {
        status: "manual",
        evidence: "Some inbound rules are missing source, port, or protocol.",
        remediation: "Fully document all inbound rules with source, port, and protocol.",
        officialRef: REF,
      };
    }

    return {
      status: "evidence-present",
      evidence: `${rules.length} inbound rule(s) documented.`,
      remediation: "Verify actual firewall enforcement and complete CDE scope.",
      officialRef: REF,
    };
  },
};

// ----------------------------------------------------------------------
// 1.3.2 — Outbound traffic from the CDE restricted to necessary traffic
// ----------------------------------------------------------------------
export const rule_1_3_2: Rule = {
  id: "OUTBOUND-RULES",
  requirement: "1.3.2",
  description:
    "Outbound traffic from the CDE restricted to only necessary traffic; all other traffic denied.",
  evaluate: (input) => {
    const rules = input.network_security?.cde_outbound_rules;
    const defaultDeny = input.network_security?.default_deny;

    if (!rules) {
      return {
        status: "insufficient",
        evidence: "No outbound rules declared.",
        remediation: "Declare cde_outbound_rules to document permitted outbound traffic.",
        officialRef: REF,
      };
    }

    if (rules.length === 0) {
      if (defaultDeny === true) {
        return {
          status: "manual",
          evidence: "Default deny is true, but no explicit outbound rules are documented.",
          remediation: "Verify no unauthorized outbound paths exist.",
          officialRef: REF,
        };
      }
      return {
        status: "gap",
        evidence: "No outbound rules are documented, and default_deny is not true.",
        remediation: "Document permitted outbound rules and enforce default deny.",
        officialRef: REF,
      };
    }

    const incomplete = rules.some((r) => !r.destination || !r.port || !r.protocol);
    if (incomplete) {
      return {
        status: "manual",
        evidence: "Some outbound rules are missing destination, port, or protocol.",
        remediation: "Fully document all outbound rules with destination, port, and protocol.",
        officialRef: REF,
      };
    }

    return {
      status: "evidence-present",
      evidence: `${rules.length} outbound rule(s) documented.`,
      remediation: "Verify actual firewall enforcement and complete CDE scope.",
      officialRef: REF,
    };
  },
};

// ----------------------------------------------------------------------
// 4.2.1 — Strong cryptography for PAN transmission
// ----------------------------------------------------------------------
export const rule_4_2_1: Rule = {
  id: "TLS-VERSION",
  requirement: "4.2.1",
  description:
    "Strong cryptography and security protocols safeguard PAN during transmission.",
  evaluate: (input) => {
    const tls = input.encryption?.in_transit?.tls_version;
    const ciphers = input.encryption?.in_transit?.cipher_suites;

    if (!tls) {
      return {
        status: "insufficient",
        evidence: "No TLS version declared.",
        remediation: "Declare encryption.in_transit.tls_version.",
        officialRef: REF,
      };
    }

    if (tls === "1.0" || tls === "1.1" || tls === "ssl") {
      return {
        status: "gap",
        evidence: `TLS version ${tls} is insecure.`,
        remediation: "Upgrade to TLS 1.2 or 1.3.",
        officialRef: REF,
      };
    }

    if (!ciphers || ciphers.length === 0) {
      return {
        status: "manual",
        evidence: `TLS version ${tls} is declared, but cipher suites are not.`,
        remediation: "Verify cipher suites are strong and fallback is disabled.",
        officialRef: REF,
      };
    }

    return {
      status: "evidence-present",
      evidence: `TLS ${tls} with declared cipher suites.`,
      remediation: "Verify that this configuration is enforced.",
      officialRef: REF,
    };
  },
};

// ----------------------------------------------------------------------
// 8.3.6 — Password complexity requirements
// ----------------------------------------------------------------------
export const rule_8_3_6: Rule = {
  id: "PASSWORD-COMPLEXITY",
  requirement: "8.3.6",
  description:
    "Password complexity requirements including minimum length and numeric/alphabetic composition.",
  evaluate: (input) => {
    const user = input.authentication?.user_accounts;
    if (!user) {
      return {
        status: "insufficient",
        evidence: "No user account password policy declared.",
        remediation: "Declare authentication.user_accounts.",
        officialRef: REF,
      };
    }

    const len = user.password_min_length;
    const comp = user.password_composition;

    if (len === undefined || comp === undefined) {
      return {
        status: "insufficient",
        evidence: "Missing password_min_length or password_composition.",
        remediation: "Declare both fields.",
        officialRef: REF,
      };
    }

    if (comp !== "alphanumeric") {
      return {
        status: "gap",
        evidence: `Password composition "${comp}" does not meet numeric+alphabetic requirement.`,
        remediation: "Require both numeric and alphabetic characters.",
        officialRef: REF,
      };
    }

    if (len < 8) {
      return {
        status: "gap",
        evidence: `Password minimum length ${len} is below the absolute minimum of 8.`,
        remediation: "Set minimum length to at least 12.",
        officialRef: REF,
      };
    }

    if (len >= 8 && len < 12) {
      if (user.password_system_exception_documented === true) {
        return {
          status: "manual",
          evidence: `Length ${len} is below 12 but an exception is documented.`,
          remediation: "Verify the exception applies and is valid.",
          officialRef: REF,
        };
      }
      return {
        status: "gap",
        evidence: `Length ${len} is below 12 and no exception is documented.`,
        remediation: "Set minimum length to 12 or document a valid exception.",
        officialRef: REF,
      };
    }

    return {
      status: "evidence-present",
      evidence: `Length ${len} with alphanumeric composition.`,
      remediation: "Verify actual enforcement.",
      officialRef: REF,
    };
  },
};

// ----------------------------------------------------------------------
// 8.4.2 — MFA for all non-console access into the CDE
// ----------------------------------------------------------------------
export const rule_8_4_2: Rule = {
  id: "MFA-CDE",
  requirement: "8.4.2",
  description: "MFA for all non-console access into the CDE.",
  evaluate: (input) => {
    const paths = input.authentication?.cde_non_console_access_paths;
    if (!paths) {
      return {
        status: "insufficient",
        evidence: "No non-console access paths declared.",
        remediation: "Declare authentication.cde_non_console_access_paths.",
        officialRef: REF,
      };
    }

    if (paths.length === 0) {
      return {
        status: "manual",
        evidence: "Empty access path list.",
        remediation: "Declare all paths or verify no non-console access exists.",
        officialRef: REF,
      };
    }

    const exceptions: string[] = [];
    let hasGap = false;

    for (const p of paths) {
      if (p.mfa_enabled === false) {
        if (p.exception_reason === "phishing-resistant-auth-only") {
          exceptions.push(p.id);
        } else {
          hasGap = true;
        }
      }
    }

    if (hasGap) {
      return {
        status: "gap",
        evidence: "One or more access paths lack MFA without a valid exception.",
        remediation: "Enable MFA or document a valid phishing-resistant exception.",
        officialRef: REF,
      };
    }

    if (exceptions.length > 0) {
      return {
        status: "manual",
        evidence: `Paths lacking MFA but claiming phishing-resistant exception: ${exceptions.join(", ")}.`,
        remediation: "Verify exception applicability.",
        officialRef: REF,
      };
    }

    return {
      status: "evidence-present",
      evidence: `All ${paths.length} access paths have MFA declared.`,
      remediation: "Verify enforcement.",
      officialRef: REF,
    };
  },
};

// ----------------------------------------------------------------------
// 10.4.1 — Daily review of applicable audit logs
// ----------------------------------------------------------------------
export const rule_10_4_1: Rule = {
  id: "LOG-REVIEW",
  requirement: "10.4.1",
  description: "Daily review of applicable audit logs.",
  evaluate: (input) => {
    const freq = input.logging?.review_frequency;
    if (!freq) {
      return {
        status: "insufficient",
        evidence: "Review frequency not declared.",
        remediation: "Declare logging.review_frequency.",
        officialRef: REF,
      };
    }

    if (freq !== "daily") {
      return {
        status: "gap",
        evidence: `Declared review frequency is "${freq}", not daily.`,
        remediation: "Review logs daily.",
        officialRef: REF,
      };
    }

    return {
      status: "manual",
      evidence: "Daily review is declared.",
      remediation: "Verify daily reviews actually occurred.",
      officialRef: REF,
    };
  },
};

// ----------------------------------------------------------------------
// 10.5.1 — Audit log retention
// ----------------------------------------------------------------------
export const rule_10_5_1: Rule = {
  id: "LOG-RETENTION",
  requirement: "10.5.1",
  description: "Audit log retention for at least 12 months, most recent three months immediately available.",
  evaluate: (input) => {
    const dests = input.logging?.destinations;
    if (!dests) {
      return {
        status: "insufficient",
        evidence: "No logging destinations declared.",
        remediation: "Declare logging.destinations.",
        officialRef: REF,
      };
    }

    const cdeDests = dests.filter((d) => d.covers_cde_systems === true);
    if (cdeDests.length === 0) {
      return {
        status: "manual",
        evidence: "No destination marked as covering CDE systems.",
        remediation: "Declare destinations that cover CDE systems.",
        officialRef: REF,
      };
    }

    const issues: string[] = [];
    for (const d of cdeDests) {
      if (d.retention_months === undefined || d.retention_months < 12) {
        issues.push(`retention_months ${d.retention_months ?? "missing"}`);
      }
      if (d.immediately_available_months === undefined || d.immediately_available_months < 3) {
        issues.push(`immediately_available_months ${d.immediately_available_months ?? "missing"}`);
      }
    }

    if (issues.length > 0) {
      return {
        status: "gap",
        evidence: `Retention gaps found: ${issues.join("; ")}.`,
        remediation: "Ensure 12 months retention and 3 months immediate availability.",
        officialRef: REF,
      };
    }

    return {
      status: "evidence-present",
      evidence: `All ${cdeDests.length} CDE destinations meet retention thresholds.`,
      remediation: "Verify actual configuration.",
      officialRef: REF,
    };
  },
};

// ----------------------------------------------------------------------
// 11.3.1 — Internal vulnerability scanning
// ----------------------------------------------------------------------
export const rule_11_3_1: Rule = {
  id: "INTERNAL-SCAN",
  requirement: "11.3.1",
  description: "Internal vulnerability scans performed.",
  evaluate: (input) => {
    const freq = input.vulnerability_management?.internal_scan_frequency_days;
    if (freq === undefined) {
      return {
        status: "insufficient",
        evidence: "Internal scan frequency not declared.",
        remediation: "Declare vulnerability_management.internal_scan_frequency_days.",
        officialRef: REF,
      };
    }

    if (freq > 90) {
      return {
        status: "gap",
        evidence: `Internal scan frequency ${freq} days exceeds 90 days.`,
        remediation: "Scan at least quarterly.",
        officialRef: REF,
      };
    }

    return {
      status: "manual",
      evidence: `Internal scan frequency declared as ${freq} days.`,
      remediation: "Verify scans actually execute and findings are remediated.",
      officialRef: REF,
    };
  },
};

// ----------------------------------------------------------------------
// 11.3.2 — External vulnerability scanning
// ----------------------------------------------------------------------
export const rule_11_3_2: Rule = {
  id: "EXTERNAL-SCAN",
  requirement: "11.3.2",
  description: "External vulnerability scans performed via ASV.",
  evaluate: (input) => {
    const freq = input.vulnerability_management?.external_scan_frequency_days;
    const asv = input.vulnerability_management?.asv_provider;

    if (freq === undefined) {
      return {
        status: "insufficient",
        evidence: "External scan frequency not declared.",
        remediation: "Declare vulnerability_management.external_scan_frequency_days.",
        officialRef: REF,
      };
    }

    if (freq > 90) {
      return {
        status: "gap",
        evidence: `External scan frequency ${freq} days exceeds 90 days.`,
        remediation: "Scan at least quarterly.",
        officialRef: REF,
      };
    }

    if (!asv) {
      return {
        status: "manual",
        evidence: "External scan frequency is valid, but no ASV provider is declared.",
        remediation: "Verify an approved ASV performs the scans.",
        officialRef: REF,
      };
    }

    return {
      status: "manual",
      evidence: `External scan frequency declared as ${freq} days with ASV ${asv}.`,
      remediation: "Verify scans execute and pass.",
      officialRef: REF,
    };
  },
};

export const ALL_RULES: Rule[] = [
  rule_1_2_7,
  rule_1_3_1,
  rule_1_3_2,
  rule_4_2_1,
  rule_8_3_6,
  rule_8_4_2,
  rule_10_4_1,
  rule_10_5_1,
  rule_11_3_1,
  rule_11_3_2,
];