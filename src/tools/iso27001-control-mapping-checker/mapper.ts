// src/tools/iso27001-control-mapping-checker/mapper.ts

import { ANNEX_A_CONTROLS, CONTROL_ID_PATTERN, isKnownControlId } from "./annex-a-controls";
import type { MappingEdge, PolicyRecord } from "./types";

const STOPWORDS = new Set([
  "the","a","an","and","or","of","for","to","in","on","with","by","is","are","be","as","at","from","that","this","these","those","it","its","our","we","shall","must","will","should","may","can","all","any","each","other","such","which","who","when","where","within","without","has","have","had","do","does","did","not","no","but","if","then","than","also","use","used","using"
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Extract every Annex A control ID that appears explicitly in the policy's
 * declared control-reference field, plus any well-formed control IDs that
 * appear in the description. Bare numbers are not accepted. The returned list
 * is deduplicated and filtered to known control IDs.
 */
export function extractExplicitControlRefs(policy: PolicyRecord): string[] {
  const haystack = `${policy.evidenceRefs ?? ""} ${policy.policyDescription} ${policy.policyName}`;
  const matches = haystack.match(/A\.(?:5|6|7|8)\.\d{1,2}/g) ?? [];
  const unique = new Set<string>();
  for (const m of matches) {
    if (!CONTROL_ID_PATTERN.test(m)) continue;
    if (!isKnownControlId(m)) continue;
    unique.add(m);
  }
  return [...unique];
}

/**
 * Produce deterministic keyword-suggestion edges for a single policy.
 * A control qualifies when at least one of its curated keywords appears as
 * a whole word (or whole phrase) in the policy's name+description+category+scope.
 * The matchReason is a human-readable explanation, never a numeric score.
 */
export function suggestMappings(policy: PolicyRecord): MappingEdge[] {
  const haystack = [
    policy.policyName,
    policy.policyDescription,
    policy.category ?? "",
    policy.scope ?? "",
  ].join(" \n ");
  const lower = haystack.toLowerCase();
  const tokens = new Set(tokenize(haystack));

  const edges: MappingEdge[] = [];
  for (const control of ANNEX_A_CONTROLS) {
    for (const kw of control.keywords) {
      const kwLower = kw.toLowerCase();
      const kwTokens = kwLower.split(/\s+/).filter(Boolean);
      let matched = false;

      if (kwTokens.length === 1) {
        matched = tokens.has(kwLower);
      } else {
        // Whole phrase: word-boundary match against the normalized haystack.
        const escaped = kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
        matched = re.test(lower);
      }

      if (matched) {
        edges.push({
          policyId: policy.policyId,
          controlId: control.id,
          source: "keyword_suggestion",
          reviewStatus: "unreviewed",
          matchReason: `Keyword match: "${kw}"`,
        });
        break;
      }
    }
  }
  return edges;
}

/**
 * Produce user_declared_ref edges from explicit references. These are still
 * unreviewed by default: an explicit reference is not the same as an accepted
 * mapping.
 */
export function declaredRefEdges(policy: PolicyRecord): MappingEdge[] {
  return extractExplicitControlRefs(policy).map((controlId) => ({
    policyId: policy.policyId,
    controlId,
    source: "user_declared_ref",
    reviewStatus: "unreviewed",
    matchReason: "Explicit Annex A reference in policy text",
  }));
}

/**
 * Produce all initial edges for a policy: declared refs first, then keyword
 * suggestions. Declared refs take precedence; a control that already appears
 * in a declared ref is not also suggested.
 */
export function initialEdgesForPolicy(policy: PolicyRecord): MappingEdge[] {
  const declared = declaredRefEdges(policy);
  const declaredSet = new Set(declared.map((e) => e.controlId));
  const suggestions = suggestMappings(policy).filter((e) => !declaredSet.has(e.controlId));
  return [...declared, ...suggestions];
}

/**
 * Deduplicate edges by (policyId, controlId), keeping the first occurrence.
 * A declared ref wins over a suggestion; a manual override wins over both.
 */
/**
 * Variant of extractExplicitControlRefs that also returns control-reference
 * candidates which resemble Annex A IDs (A.<n>.<n>) but are not in the
 * catalogue. These are surfaced to the user as diagnostics.
 */
export function extractExplicitControlRefsWithDiagnostics(policy: PolicyRecord): {
  refs: string[];
  invalidRefs: string[];
} {
  const haystack = `${policy.evidenceRefs ?? ""} ${policy.policyDescription} ${policy.policyName}`;
  // Broader candidate pattern: any A.<digits>.<digits> sequence. Every match
  // is a candidate reference; classification below decides valid vs invalid.
  // A bare "5.1" without the "A." prefix is not a candidate and is not
  // reported as invalid, so ordinary numbers do not trigger diagnostics.
  const candidates = haystack.match(/A\.\d{1,3}\.\d{1,3}/g) ?? [];
  const valid = new Set<string>();
  const invalid = new Set<string>();
  for (const candidate of candidates) {
    // Valid = matches the strict Annex A shape AND is present in the catalogue.
    if (CONTROL_ID_PATTERN.test(candidate) && isKnownControlId(candidate)) {
      valid.add(candidate);
    } else {
      // Reached the broad A.<n>.<n> pattern but failed the strict shape or
      // is out of catalogue range — report as invalid.
      invalid.add(candidate);
    }
  }
  return { refs: [...valid], invalidRefs: [...invalid] };
}

/**
 * Variant of initialEdgesForPolicy that also returns the invalid reference
 * candidates for diagnostic surfacing. Declared valid refs still take
 * precedence over suggestions; invalid refs do not create edges.
 */
export function initialEdgesForPolicyWithDiagnostics(policy: PolicyRecord): {
  edges: MappingEdge[];
  invalidRefs: string[];
} {
  const { refs, invalidRefs } = extractExplicitControlRefsWithDiagnostics(policy);
  const declared: MappingEdge[] = refs.map((controlId) => ({
    policyId: policy.policyId,
    controlId,
    source: "user_declared_ref",
    reviewStatus: "unreviewed",
    matchReason: "Explicit Annex A reference in policy text",
  }));
  const declaredSet = new Set(refs);
  const suggestions = suggestMappings(policy).filter((e) => !declaredSet.has(e.controlId));
  return { edges: [...declared, ...suggestions], invalidRefs };
}
export function dedupeEdges(edges: MappingEdge[]): MappingEdge[] {
  const rank: Record<MappingEdge["source"], number> = {
    user_declared_ref: 2,
    manual_override: 3,
    keyword_suggestion: 1,
  };
  const map = new Map<string, MappingEdge>();
  for (const e of edges) {
    const key = `${e.policyId}::${e.controlId}`;
    const existing = map.get(key);
    if (!existing || rank[e.source] > rank[existing.source]) {
      map.set(key, e);
    }
  }
  return [...map.values()];
}
