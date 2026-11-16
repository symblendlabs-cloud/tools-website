// src/tools/iso27001-control-mapping-checker/types.ts

/**
 * Domain types for the ISO 27001 Control Mapping Checker.
 *
 * Applicability, mapping, implementation and evidence are kept as four
 * independent dimensions. None of them is collapsed into a numeric score.
 */

export const STANDARD_ID = "ISO/IEC 27001:2022 Annex A" as const;
export const STANDARD_VERSION = "2022" as const;
export const TOTAL_CONTROLS = 93 as const;

export type Theme = "organizational" | "people" | "physical" | "technological";

export interface ControlDefinition {
  /** Canonical Annex A control identifier, e.g. "A.5.1". */
  id: string;
  theme: Theme;
  /** Original editorial label. Not an official ISO title. */
  label: string;
  /** Curated keywords used for deterministic suggestion matching. */
  keywords: readonly string[];
}

// ---- Policy ---------------------------------------------------------------

export interface PolicyRecord {
  policyId: string;
  policyName: string;
  policyDescription: string;
  owner?: string;
  category?: string;
  status?: string;
  scope?: string;
  evidenceRefs?: string;
  /** 1-based original row number in the imported file, when known. */
  sourceRow?: number;
  /** True when at least one input cell was a formula cell. */
  hadFormulaCells?: boolean;
}

// ---- Applicability --------------------------------------------------------

export type ApplicabilityState = "not_assessed" | "applicable" | "not_applicable";

export interface ApplicabilityDecision {
  controlId: string;
  state: ApplicabilityState;
  /** Required iff state === "not_applicable". */
  justification?: string;
}

// ---- Mapping --------------------------------------------------------------

export type MappingSource = "user_declared_ref" | "keyword_suggestion" | "manual_override";
export type ReviewStatus = "unreviewed" | "accepted" | "rejected" | "reassigned";

export interface MappingEdge {
  policyId: string;
  controlId: string;
  source: MappingSource;
  reviewStatus: ReviewStatus;
  /** Human-readable explanation of why this mapping exists. */
  matchReason: string;
}

// ---- Implementation -------------------------------------------------------

export type ImplementationStatus =
  | "not_assessed"
  | "planned"
  | "in_progress"
  | "partially_implemented"
  | "implemented"
  | "not_implemented";

export interface ImplementationAssessment {
  controlId: string;
  status: ImplementationStatus;
  evidenceRefs?: string;
}

// ---- Derived control state ------------------------------------------------

export type DerivedControlState =
  | "not_assessed"
  | "excluded"
  | "covered"
  | "suggested"
  | "rejected_only"
  | "unmapped";

// ---- Import / export ------------------------------------------------------

export interface ImportDiagnostic {
  row: number;
  column?: string;
  message: string;
  severity: "error" | "warning";
}

export interface ParsedImport {
  policies: PolicyRecord[];
  diagnostics: ImportDiagnostic[];
}

// ---- Coverage -------------------------------------------------------------

export interface CoverageCounts {
  total: number;
  applicable: number;
  notApplicable: number;
  notAssessed: number;
  applicableWithAccepted: number;
  applicableWithoutAccepted: number;
  suggestionsAwaitingReview: number;
  rejectedMappings: number;
}

export interface CoverageResult {
  /** null when no applicable controls exist (display "N/A"). */
  percent: number | null;
  counts: CoverageCounts;
  byTheme: Record<Theme, { applicable: number; withAccepted: number; percent: number | null }>;
}

// ---- Complete assessment --------------------------------------------------

export interface AssessmentData {
  policies: PolicyRecord[];
  applicability: Record<string, ApplicabilityDecision>;
  mappings: MappingEdge[];
  implementations: Record<string, ImplementationAssessment>;
}
