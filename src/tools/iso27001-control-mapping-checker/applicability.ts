// src/tools/iso27001-control-mapping-checker/applicability.ts

import { ANNEX_A_CONTROLS, CONTROL_BY_ID } from "./annex-a-controls";
import type {
  ApplicabilityDecision,
  ApplicabilityState,
  DerivedControlState,
  MappingEdge,
} from "./types";

export function defaultApplicability(): Record<string, ApplicabilityDecision> {
  const out: Record<string, ApplicabilityDecision> = {};
  for (const c of ANNEX_A_CONTROLS) {
    out[c.id] = { controlId: c.id, state: "not_assessed" };
  }
  return out;
}

export interface ApplicabilityValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Validate a single applicability change. A not_applicable decision must be
 * accompanied by a non-empty justification. Applicability cannot be set for
 * unknown control IDs.
 */
export function validateApplicabilityDecision(
  decision: ApplicabilityDecision,
): ApplicabilityValidation {
  const errors: string[] = [];
  if (!CONTROL_BY_ID.has(decision.controlId)) {
    errors.push(`Unknown control ID: ${decision.controlId}`);
  }
  if (decision.state !== "applicable" && decision.state !== "not_applicable" && decision.state !== "not_assessed") {
    errors.push(`Invalid applicability state: ${String(decision.state)}`);
  }
  if (decision.state === "not_applicable") {
    const j = decision.justification?.trim() ?? "";
    if (j.length === 0) {
      errors.push("A justification is required when marking a control as not applicable.");
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Derive the per-control presentation state from applicability and mappings.
 * Rules (matching the agreed specification):
 *  - not_assessed (default)
 *  - excluded       -> applicability = not_applicable
 *  - covered        -> applicable + at least one accepted edge
 *  - suggested      -> applicable + no accepted edge + at least one unreviewed suggestion
 *  - rejected_only  -> applicable + no accepted edge + no unreviewed + at least one rejected edge
 *  - unmapped       -> applicable + no edges at all
 */
export function deriveControlState(
  controlId: string,
  applicability: Record<string, ApplicabilityDecision>,
  edges: MappingEdge[],
): DerivedControlState {
  const decision = applicability[controlId];
  if (!decision || decision.state === "not_assessed") return "not_assessed";
  if (decision.state === "not_applicable") return "excluded";

  const controlEdges = edges.filter((e) => e.controlId === controlId);
  const hasAccepted = controlEdges.some((e) => e.reviewStatus === "accepted");
  if (hasAccepted) return "covered";

  const hasUnreviewed = controlEdges.some(
    (e) => e.reviewStatus === "unreviewed" && e.source === "keyword_suggestion",
  );
  if (hasUnreviewed) return "suggested";

  const hasRejected = controlEdges.some((e) => e.reviewStatus === "rejected");
  if (hasRejected) return "rejected_only";

  return "unmapped";
}

/**
 * Apply a single applicability change and return a new record. Applicability
 * changes never delete mapping edges.
 */
export function setApplicability(
  current: Record<string, ApplicabilityDecision>,
  controlId: string,
  state: ApplicabilityState,
  justification?: string,
): { next: Record<string, ApplicabilityDecision>; validation: ApplicabilityValidation } {
  const decision: ApplicabilityDecision = {
    controlId,
    state,
    justification: state === "not_applicable" ? (justification ?? "").trim() : undefined,
  };
  const validation = validateApplicabilityDecision(decision);
  if (!validation.ok) {
    return { next: current, validation };
  }
  const next = { ...current, [controlId]: decision };
  return { next, validation };
}
