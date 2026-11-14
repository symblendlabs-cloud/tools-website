/**
 * GEO checks — source mode.
 *
 * Pure functions. Each exports:
 *   { id, description, recommendationId?, evaluate(input): CheckResult }
 *
 * A CheckResult is:
 *   { status, evidence, limitations, manualReview }
 *
 * status values:
 *   "pass" | "warning" | "fail" | "not-applicable" | "informational"
 */

/**
 * A1 — Title and description exist.
 *
 * Missing required values fail. Length observations are advisory.
 */
export const A1 = {
  id: "A1",
  description: "Page title and description exist.",
  recommendationId: null,
  evaluate(page) {
    const title = typeof page.title === "string" ? page.title.trim() : "";
    const description =
      typeof page.description === "string" ? page.description.trim() : "";

    if (title.length === 0 || description.length === 0) {
      return {
        status: "fail",
        evidence: `title=${title.length} chars, description=${description.length} chars`,
        limitations: "Missing title or description is a real defect for any search or AI system.",
        manualReview: false,
      };
    }

    const lengthObservations = [];
    if (title.length < 10) lengthObservations.push(`title is short (${title.length} chars)`);
    if (title.length > 70) lengthObservations.push(`title is long (${title.length} chars)`);
    if (description.length < 50) lengthObservations.push(`description is short (${description.length} chars)`);
    if (description.length > 200) lengthObservations.push(`description is long (${description.length} chars)`);

    if (lengthObservations.length === 0) {
      return {
        status: "pass",
        evidence: `title=${title.length} chars, description=${description.length} chars`,
        limitations: "Length ranges are advisory heuristics, not universal requirements.",
        manualReview: false,
      };
    }

    return {
      status: "warning",
      evidence: lengthObservations.join("; "),
      limitations: "Length ranges are advisory heuristics, not universal requirements.",
      manualReview: true,
    };
  },
};

/**
 * B3 — Duplicate page descriptions.
 *
 * Operates on the full page list, not on individual pages.
 * Returns a map: description -> [urls]. Any description shared by >1 page
 * is reported as a warning on each of those pages.
 */
export const B3 = {
  id: "B3",
  description: "Duplicate page descriptions.",
  recommendationId: null,
  evaluateAll(pages) {
    const byDescription = new Map();
    for (const page of pages) {
      const description =
        typeof page.description === "string" ? page.description.trim() : "";
      if (description.length === 0) continue;
      if (!byDescription.has(description)) byDescription.set(description, []);
      byDescription.get(description).push(page.url);
    }

    const duplicates = new Map();
    for (const [description, urls] of byDescription) {
      if (urls.length > 1) duplicates.set(description, urls);
    }

    const results = new Map();
    for (const page of pages) {
      const description =
        typeof page.description === "string" ? page.description.trim() : "";
      const shared = duplicates.get(description);
      if (shared) {
        results.set(page.url, {
          status: "warning",
          evidence: `Description is shared by ${shared.length} pages: ${shared.join(", ")}`,
          limitations:
            "Duplicates may be intentional (e.g., site-wide generic description). Review each.",
          manualReview: true,
        });
      } else {
        results.set(page.url, {
          status: "pass",
          evidence: "Description is unique across the analyzed pages.",
          limitations:
            "Uniqueness is checked only within this analyzer's page list, not across the entire web.",
          manualReview: false,
        });
      }
    }
    return results;
  },
};

/**
 * F1 — FAQ availability.
 *
 * Informational only. Not a GEO failure.
 */
export const F1 = {
  id: "F1",
  description: "FAQ availability.",
  recommendationId: null,
  evaluate(page) {
    if (page.type !== "tool") {
      return {
        status: "not-applicable",
        evidence: `FAQ check applies to tools; page type is ${page.type}.`,
        limitations: "Guides do not currently have a structured FAQ field.",
        manualReview: false,
      };
    }
    const faqs = page.faqs ?? [];
    if (!Array.isArray(faqs)) {
      return {
        status: "informational",
        evidence: "FAQ data is not an array.",
        limitations: "Data shape is unexpected; treat as absence rather than failure.",
        manualReview: false,
      };
    }
    if (faqs.length === 0) {
      return {
        status: "informational",
        evidence: "No FAQs on this page.",
        limitations: "FAQs are a useful citation signal but not required.",
        manualReview: false,
      };
    }
    return {
      status: "informational",
      evidence: `${faqs.length} FAQ(s) present.`,
      limitations: "Presence does not imply usefulness; see F2.",
      manualReview: false,
    };
  },
};

/**
 * F2 — FAQ answer lengths.
 *
 * Advisory only. No universal minimum. A short answer may be perfectly clear.
 */
export const F2 = {
  id: "F2",
  description: "FAQ answer lengths (advisory).",
  recommendationId: null,
  evaluate(page) {
    if (page.type !== "tool") {
      return {
        status: "not-applicable",
        evidence: `FAQ length check applies to tools; page type is ${page.type}.`,
        limitations: "Guides do not currently have a structured FAQ field.",
        manualReview: false,
      };
    }
    const faqs = page.faqs ?? [];
    if (!Array.isArray(faqs) || faqs.length === 0) {
      return {
        status: "not-applicable",
        evidence: "No FAQs to evaluate.",
        limitations: "F2 depends on F1 having found at least one FAQ.",
        manualReview: false,
      };
    }

    const short = [];
    for (const faq of faqs) {
      if (typeof faq.answer !== "string") continue;
      const wordCount = faq.answer.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount < 40) {
        short.push({ id: faq.id, wordCount });
      }
    }

    if (short.length === 0) {
      return {
        status: "pass",
        evidence: `All ${faqs.length} FAQ answers are ≥40 words.`,
        limitations: "40 words is an advisory heuristic, not a requirement.",
        manualReview: false,
      };
    }

    return {
      status: "warning",
      evidence: `${short.length} FAQ answer(s) under 40 words: ${short
        .map((s) => `${s.id} (${s.wordCount})`)
        .join(", ")}`,
      limitations:
        "Short answers may be intentional. This is a review prompt, not a defect.",
      manualReview: true,
    };
  },
};

/**
 * I1 — Publication or modification dates.
 *
 * Reports available / missing / not-applicable. Never fails solely because
 * dates are absent.
 */
export const I1 = {
  id: "I1",
  description: "Publication or modification dates.",
  recommendationId: null,
  evaluate(page) {
    const candidates = ["datePublished", "dateModified", "publishedAt", "updatedAt"];
    const found = {};
    for (const key of candidates) {
      if (page[key] !== undefined && page[key] !== null && page[key] !== "") {
        found[key] = page[key];
      }
    }

    if (Object.keys(found).length === 0) {
      return {
        status: "not-applicable",
        evidence: "No date field is exposed by the public content projection.",
        limitations:
          "The public projection may omit dates even when frontmatter or JSON-LD carries them. Not having a date is not a failure.",
        manualReview: false,
      };
    }

    return {
      status: "informational",
      evidence: `Date fields present: ${JSON.stringify(found)}`,
      limitations:
        "Date presence is informational. Whether the date is current is not evaluated in Phase 2A.",
      manualReview: false,
    };
  },
};

export const allChecks = [A1, F1, F2, I1];
export const siteChecks = [B3];