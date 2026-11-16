// src/tools/iso27001-control-mapping-checker/coverage.ts

import { ANNEX_A_CONTROLS, THEMES } from "./annex-a-controls";
import type {
  ApplicabilityDecision,
  CoverageCounts,
  CoverageResult,
  MappingEdge,
  Theme,
} from "./types";

/**
 * Coverage = applicable controls with at least one accepted mapping /
 * total applicable controls * 100.
 *
 * Rules:
 *  - not_applicable and not_assessed controls are excluded from the denominator
 *  - suggested mappings do not count as coverage
 *  - rejected mappings do not count
 *  - multiple accepted edges for one control count once
 *  - no applicable controls -> percent = null (UI shows "N/A")
 */
export function computeCoverage(
  applicability: Record<string, ApplicabilityDecision>,
  edges: MappingEdge[],
): CoverageResult {
  const counts: CoverageCounts = {
    total: ANNEX_A_CONTROLS.length,
    applicable: 0,
    notApplicable: 0,
    notAssessed: 0,
    applicableWithAccepted: 0,
    applicableWithoutAccepted: 0,
    suggestionsAwaitingReview: 0,
    rejectedMappings: 0,
  };

  const byTheme: Record<Theme, { applicable: number; withAccepted: number; percent: number | null }> = {
    organizational: { applicable: 0, withAccepted: 0, percent: null },
    people:         { applicable: 0, withAccepted: 0, percent: null },
    physical:       { applicable: 0, withAccepted: 0, percent: null },
    technological:  { applicable: 0, withAccepted: 0, percent: null },
  };

  const acceptedControls = new Set<string>();
  let suggestionsAwaitingReview = 0;
  let rejectedMappings = 0;

  for (const e of edges) {
    if (e.reviewStatus === "accepted") acceptedControls.add(e.controlId);
    else if (e.reviewStatus === "unreviewed" && e.source === "keyword_suggestion") suggestionsAwaitingReview += 1;
    else if (e.reviewStatus === "rejected") rejectedMappings += 1;
  }

  for (const c of ANNEX_A_CONTROLS) {
    const decision = applicability[c.id];
    const state = decision?.state ?? "not_assessed";
    if (state === "not_applicable") { counts.notApplicable += 1; continue; }
    if (state === "not_assessed")   { counts.notAssessed += 1;   continue; }

    counts.applicable += 1;
    byTheme[c.theme].applicable += 1;

    if (acceptedControls.has(c.id)) {
      counts.applicableWithAccepted += 1;
      byTheme[c.theme].withAccepted += 1;
    } else {
      counts.applicableWithoutAccepted += 1;
    }
  }

  counts.suggestionsAwaitingReview = suggestionsAwaitingReview;
  counts.rejectedMappings = rejectedMappings;

  for (const theme of THEMES) {
    const t = byTheme[theme];
    t.percent = t.applicable === 0 ? null : Math.round((t.withAccepted / t.applicable) * 1000) / 10;
  }

  const percent =
    counts.applicable === 0
      ? null
      : Math.round((counts.applicableWithAccepted / counts.applicable) * 1000) / 10;

  return { percent, counts, byTheme };
}
