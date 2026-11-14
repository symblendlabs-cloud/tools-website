/**
 * Report builder.
 *
 * Phase 2A callers may omit `pageChecks` and `siteChecks`; the function then
 * falls back to the source-mode check arrays from ./checks.mjs. Phase 2B
 * callers pass the build-mode arrays from ./checks-build.mjs.
 */

import { allChecks as defaultPageChecks, siteChecks as defaultSiteChecks } from "./checks.mjs";

export function classifyPage(checkResults) {
  const hasFail = checkResults.some((c) => c.status === "fail");
  if (hasFail) return "blocking-findings";
  const hasReview = checkResults.some(
    (c) => c.status === "warning" || c.manualReview === true,
  );
  if (hasReview) return "review-recommended";
  return "no-blocking-findings";
}

export function buildReport({
  pages,
  origin,
  geoRegistry,
  mode,
  analyzedAt,
  pageChecks = defaultPageChecks,
  siteChecks = defaultSiteChecks,
  siteContext = {},
}) {
  // Site-level checks
  const siteResults = [];
  for (const check of siteChecks) {
    if (typeof check.evaluateAll === "function") {
      const perPage = check.evaluateAll(pages, siteContext);
      const nonPass = [];
      for (const [url, result] of perPage) {
        if (result.status !== "pass") nonPass.push({ url, ...result });
      }
      siteResults.push({
        checkId: check.id,
        description: check.description,
        status: nonPass.length > 0 ? "warning" : "pass",
        evidence:
          nonPass.length === 0
            ? "All pages pass."
            : `${nonPass.length} page(s) affected.`,
        details: nonPass,
        limitations: "Duplicate detection is within the analyzer's page list only.",
      });
    } else if (typeof check.evaluateSite === "function") {
      const result = check.evaluateSite(
        siteContext.robotsTxt ?? "",
        siteContext.sitemapUrls ?? [],
      );
      siteResults.push({
        checkId: check.id,
        description: check.description,
        status: result.status,
        evidence: result.evidence,
        limitations: result.limitations,
      });
    }
  }

  // Page-level checks
  const pageReports = pages.map((page) => {
    const checks = [];
    for (const check of pageChecks) {
      const result = check.evaluate(page);
      checks.push({
        checkId: check.id,
        description: check.description,
        recommendationId: check.recommendationId ?? null,
        status: result.status,
        evidence: result.evidence,
        limitations: result.limitations,
        manualReview: result.manualReview,
      });
    }

    // Site checks that produce per-page results (H1, H2, B3) are injected
    // into the page report so each page shows its own status.
    for (const check of siteChecks) {
      if (typeof check.evaluateAll === "function") {
        const perPage = check.evaluateAll(pages, siteContext);
        const r = perPage.get(page.url);
        if (r) {
          checks.push({
            checkId: check.id,
            description: check.description,
            recommendationId: check.recommendationId ?? null,
            status: r.status,
            evidence: r.evidence,
            limitations: r.limitations,
            manualReview: r.manualReview,
          });
        }
      }
    }

    return {
      url: page.url,
      type: page.type,
      title: page.title,
      description: page.description,
      classification: classifyPage(checks),
      checks,
    };
  });

  const summary = {
    totalPages: pageReports.length,
    byClassification: {
      "no-blocking-findings": 0,
      "review-recommended": 0,
      "blocking-findings": 0,
    },
    byType: {},
  };
  for (const report of pageReports) {
    summary.byClassification[report.classification] += 1;
    summary.byType[report.type] = (summary.byType[report.type] ?? 0) + 1;
  }

  return {
    analyzedAt,
    mode,
    origin,
    geoRegistryVersion: geoRegistry.version,
    geoRegistryLastReviewed: geoRegistry.lastReviewed,
    pages: pageReports,
    siteChecks: siteResults,
    summary,
  };
}