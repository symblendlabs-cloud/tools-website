// src/tools/iso27001-control-mapping-checker/annex-a-controls.ts

import {
  STANDARD_ID,
  STANDARD_VERSION,
  TOTAL_CONTROLS,
  type ControlDefinition,
  type Theme,
} from "./types";

/**
 * ISO/IEC 27001:2022 Annex A — 93 control identifiers.
 *
 * Only factual identifiers, theme membership, and short editorial labels are
 * included here. No normative ISO control text or ISO/IEC 27002 guidance is
 * reproduced. Keywords are authored for this tool; they are not ISO wording.
 */

const ORG: Array<[string, string, readonly string[]]> = [
  ["A.5.1",  "Information security policy",         ["policy", "information security policy", "review", "approval"]],
  ["A.5.2",  "Roles and responsibilities",          ["role", "responsibility", "duties", "segregation"]],
  ["A.5.3",  "Segregation of duties",               ["segregation of duties", "conflict of interest"]],
  ["A.5.4",  "Management responsibilities",         ["management", "leadership", "responsibility"]],
  ["A.5.5",  "Contact with authorities",            ["authority", "regulator", "law enforcement", "contact"]],
  ["A.5.6",  "Contact with special interest groups",["special interest", "forum", "professional body"]],
  ["A.5.7",  "Threat intelligence",                 ["threat intelligence", "threat feed", "advisory"]],
  ["A.5.8",  "Project management security",         ["project management", "project security"]],
  ["A.5.9",  "Inventory of assets",                 ["asset inventory", "asset register", "asset list"]],
  ["A.5.10", "Acceptable use of assets",            ["acceptable use", "asset usage"]],
  ["A.5.11", "Return of assets",                    ["return of assets", "offboarding", "asset return"]],
  ["A.5.12", "Classification of information",       ["classification", "information classification", "label"]],
  ["A.5.13", "Labelling of information",            ["labelling", "labeling", "information label"]],
  ["A.5.14", "Information transfer",                ["information transfer", "data transfer", "transmission"]],
  ["A.5.15", "Access control",                      ["access control", "access right", "authorization"]],
  ["A.5.16", "Identity management",                 ["identity", "identity lifecycle", "user identity"]],
  ["A.5.17", "Authentication information",          ["authentication", "credentials", "password", "secret"]],
  ["A.5.18", "Access rights",                       ["access right", "provisioning", "deprovisioning", "review"]],
  ["A.5.19", "Supplier relationships",              ["supplier", "vendor relationship"]],
  ["A.5.20", "Supplier agreements",                 ["supplier agreement", "contract", "vendor agreement"]],
  ["A.5.21", "Supplier supply chain security",      ["supply chain", "supplier security"]],
  ["A.5.22", "Supplier service monitoring",         ["supplier monitoring", "vendor review", "service review"]],
  ["A.5.23", "Cloud services security",             ["cloud", "cloud service", "saas", "iaas", "paas"]],
  ["A.5.24", "Incident management planning",        ["incident management", "incident response plan", "incident"]],
  ["A.5.25", "Incident assessment and decision",    ["incident assessment", "incident triage"]],
  ["A.5.26", "Incident response",                   ["incident response", "response", "containment"]],
  ["A.5.27", "Learning from incidents",             ["lessons learned", "incident review", "post-incident"]],
  ["A.5.28", "Collection of evidence",              ["evidence", "forensics", "chain of custody"]],
  ["A.5.29", "Information security during disruption", ["disruption", "continuity", "bcp", "dr"]],
  ["A.5.30", "ICT readiness for business continuity",  ["ict readiness", "ict continuity", "business continuity"]],
  ["A.5.31", "Legal and regulatory requirements",   ["legal", "regulatory", "statute", "compliance obligation"]],
  ["A.5.32", "Intellectual property rights",        ["intellectual property", "ip", "copyright", "licence"]],
  ["A.5.33", "Protection of records",               ["records", "record retention", "record protection"]],
  ["A.5.34", "Privacy and PII protection",          ["privacy", "pii", "personal data", "data protection", "gdpr"]],
  ["A.5.35", "Independent review of information security", ["independent review", "audit", "assurance"]],
  ["A.5.36", "Compliance with policies and standards", ["compliance", "policy compliance", "standard"]],
  ["A.5.37", "Documented operating procedures",     ["operating procedure", "procedure", "runbook"]],
];

const PEOPLE: Array<[string, string, readonly string[]]> = [
  ["A.6.1",  "Screening",                          ["screening", "background check", "vetting"]],
  ["A.6.2",  "Terms and conditions of employment", ["employment terms", "contract of employment"]],
  ["A.6.3",  "Awareness, education and training",  ["awareness", "training", "education", "security awareness"]],
  ["A.6.4",  "Disciplinary process",               ["disciplinary", "sanction", "consequence"]],
  ["A.6.5",  "Responsibilities after termination", ["termination", "offboarding", "post-employment"]],
  ["A.6.6",  "Confidentiality agreements",         ["confidentiality", "nda", "non-disclosure"]],
  ["A.6.7",  "Remote working",                     ["remote working", "telework", "work from home", "remote"]],
  ["A.6.8",  "Information security event reporting", ["reporting", "incident reporting", "event reporting"]],
];

const PHYS: Array<[string, string, readonly string[]]> = [
  ["A.7.1",  "Physical security perimeters",       ["physical perimeter", "perimeter", "site boundary"]],
  ["A.7.2",  "Physical entry",                     ["physical entry", "entry control", "badge", "access to site"]],
  ["A.7.3",  "Securing offices, rooms and facilities", ["office security", "secure room", "facility"]],
  ["A.7.4",  "Physical security monitoring",       ["cctv", "physical monitoring", "surveillance"]],
  ["A.7.5",  "Protection against physical and environmental threats", ["environmental", "fire", "flood", "physical threat"]],
  ["A.7.6",  "Working in secure areas",            ["secure area", "secure zone"]],
  ["A.7.7",  "Clear desk and clear screen",        ["clear desk", "clear screen", "clean desk"]],
  ["A.7.8",  "Equipment siting and protection",    ["equipment siting", "equipment protection"]],
  ["A.7.9",  "Security of assets off-premises",    ["off-premises", "mobile device", "laptop", "remote equipment"]],
  ["A.7.10", "Storage media",                      ["storage media", "removable media", "usb", "disk"]],
  ["A.7.11", "Supporting utilities",               ["utility", "power", "ups", "cooling"]],
  ["A.7.12", "Cabling security",                   ["cabling", "cable", "network cable"]],
  ["A.7.13", "Equipment maintenance",              ["maintenance", "equipment maintenance"]],
  ["A.7.14", "Secure disposal or re-use of equipment", ["disposal", "re-use", "equipment disposal", "decommission"]],
];

const TECH: Array<[string, string, readonly string[]]> = [
  ["A.8.1",  "User endpoint devices",              ["endpoint", "user device", "laptop", "workstation"]],
  ["A.8.2",  "Privileged access rights",           ["privileged access", "admin access", "root", "elevated"]],
  ["A.8.3",  "Information access restriction",     ["access restriction", "access restriction policy"]],
  ["A.8.4",  "Access to source code",              ["source code", "code access", "repository access"]],
  ["A.8.5",  "Secure authentication",              ["secure authentication", "mfa", "multi-factor", "authentication"]],
  ["A.8.6",  "Capacity management",                ["capacity", "capacity management", "scaling"]],
  ["A.8.7",  "Protection against malware",         ["malware", "antivirus", "endpoint protection"]],
  ["A.8.8",  "Management of technical vulnerabilities", ["vulnerability", "vulnerability management", "patch", "cve"]],
  ["A.8.9",  "Configuration management",           ["configuration", "configuration management", "baseline", "hardening"]],
  ["A.8.10", "Information deletion",               ["information deletion", "data deletion", "erase", "wipe"]],
  ["A.8.11", "Data masking",                       ["data masking", "masking", "pseudonymization"]],
  ["A.8.12", "Data leakage prevention",            ["dlp", "data leakage", "data loss prevention"]],
  ["A.8.13", "Information backup",                 ["backup", "restore", "backup retention"]],
  ["A.8.14", "Redundancy of information processing facilities", ["redundancy", "high availability", "failover"]],
  ["A.8.15", "Logging",                            ["logging", "log", "audit log"]],
  ["A.8.16", "Monitoring activities",              ["monitoring", "siem", "detection"]],
  ["A.8.17", "Clock synchronization",              ["clock", "ntp", "time synchronization"]],
  ["A.8.18", "Use of privileged utility programs", ["privileged utility", "utility program"]],
  ["A.8.19", "Installation of software on operational systems", ["software installation", "software install"]],
  ["A.8.20", "Networks security",                  ["network security", "network", "firewall"]],
  ["A.8.21", "Security of network services",       ["network service", "service security"]],
  ["A.8.22", "Segregation of networks",            ["network segregation", "segmentation", "vlan"]],
  ["A.8.23", "Web filtering",                      ["web filter", "web filtering", "url filter"]],
  ["A.8.24", "Use of cryptography",                ["cryptography", "encryption", "crypto", "key management"]],
  ["A.8.25", "Secure development life cycle",      ["secure development", "sdlc", "secure coding"]],
  ["A.8.26", "Application security requirements",  ["application security", "appsec", "security requirement"]],
  ["A.8.27", "Secure system architecture and engineering principles", ["secure architecture", "engineering principles", "secure design"]],
  ["A.8.28", "Secure coding",                      ["secure coding", "code review", "code scanning"]],
  ["A.8.29", "Security testing in development and acceptance", ["security testing", "sast", "dast", "penetration testing"]],
  ["A.8.30", "Outsourced development",             ["outsourced development", "external development"]],
  ["A.8.31", "Separation of development, test and production environments", ["separation of environments", "dev", "test", "production", "environment"]],
  ["A.8.32", "Change management",                  ["change management", "change control", "change"]],
  ["A.8.33", "Test information",                   ["test information", "test data"]],
  ["A.8.34", "Protection of information systems during audit testing", ["audit testing", "audit", "testing"]],
];

function makeTheme(theme: Theme, rows: Array<[string, string, readonly string[]]>): ControlDefinition[] {
  return rows.map(([id, label, keywords]) => ({ id, theme, label, keywords }));
}

const FROZEN: readonly ControlDefinition[] = Object.freeze([
  ...makeTheme("organizational", ORG),
  ...makeTheme("people", PEOPLE),
  ...makeTheme("physical", PHYS),
  ...makeTheme("technological", TECH),
]);

export const ANNEX_A_CONTROLS: readonly ControlDefinition[] = FROZEN;

export const CONTROL_IDS: ReadonlySet<string> = new Set(FROZEN.map((c) => c.id));

export const CONTROL_BY_ID: ReadonlyMap<string, ControlDefinition> = new Map(
  FROZEN.map((c) => [c.id, c]),
);

export const THEMES: readonly Theme[] = [
  "organizational",
  "people",
  "physical",
  "technological",
];

export const THEME_COUNTS: Readonly<Record<Theme, number>> = Object.freeze({
  organizational: ORG.length,
  people: PEOPLE.length,
  physical: PHYS.length,
  technological: TECH.length,
});

export const STANDARD_META = Object.freeze({
  id: STANDARD_ID,
  version: STANDARD_VERSION,
  totalControls: TOTAL_CONTROLS,
});

/**
 * Canonical regex for a valid Annex A control identifier. Matches only the
 * exact shape produced by this catalogue. It intentionally does not accept
 * bare numbers or unrelated dot notation.
 */
export const CONTROL_ID_PATTERN = /^A\.(5|6|7|8)\.(\d{1,2})$/;

export function isKnownControlId(id: string): boolean {
  return CONTROL_IDS.has(id);
}

export function controlsByTheme(theme: Theme): readonly ControlDefinition[] {
  return FROZEN.filter((c) => c.theme === theme);
}
