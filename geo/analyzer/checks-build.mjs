/**
 * GEO checks — build mode.
 *
 * Same result shape as source mode. All heuristic thresholds are labeled
 * as heuristics, never as AI platform ranking requirements.
 */

/**
 * A2 — Single <h1> and at least one <h2>.
 */
export const A2 = {
  id: "A2",
  description: "Single H1 and at least one H2.",
  recommendationId: null,
  evaluate(page) {
    const h1s = page.headings.filter((h) => h.level === 1);
    const h2s = page.headings.filter((h) => h.level === 2);
    if (h1s.length === 0) {
      return {
        status: "fail",
        evidence: "No <h1> found.",
        limitations: "The page's main title should be an h1.",
        manualReview: false,
      };
    }
    if (h1s.length > 1) {
      return {
        status: "warning",
        evidence: `Multiple <h1> elements: ${h1s.length}.`,
        limitations: "One h1 is conventional; multiple may be intentional but often indicates a template issue.",
        manualReview: true,
      };
    }
    if (h2s.length === 0) {
      return {
        status: "warning",
        evidence: "One <h1>, but no <h2>.",
        limitations: "Subheadings help structure content for extraction.",
        manualReview: true,
      };
    }
    return {
      status: "pass",
      evidence: `1 <h1>, ${h2s.length} <h2>.`,
      limitations: null,
      manualReview: false,
    };
  },
};

/**
 * A3 — Title tokens appear in the first 200 words of main content.
 * Heuristic. Never fails.
 */
export const A3 = {
  id: "A3",
  description: "Title subject appears early in main content (advisory).",
  recommendationId: null,
  evaluate(page) {
    const stopwords = new Set(["a", "an", "the", "and", "or", "for", "of", "to", "in", "on", "with", "from", "by"]);
    const titleTokens = (page.title ?? "")
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2 && !stopwords.has(t));
    if (titleTokens.length === 0) {
      return {
        status: "not-applicable",
        evidence: "Title has no significant tokens.",
        limitations: "A3 depends on a title with identifiable subjects.",
        manualReview: false,
      };
    }
    const firstWords = (page.mainText ?? "")
      .split(/\s+/)
      .slice(0, 200)
      .join(" ")
      .toLowerCase();
    const matched = titleTokens.filter((t) => firstWords.includes(t));
    if (matched.length === 0) {
      return {
        status: "warning",
        evidence: `0 of ${titleTokens.length} title tokens appear in the first 200 words.`,
        limitations: "Heuristic. Some pages legitimately lead with context before the subject.",
        manualReview: true,
      };
    }
    if (matched.length < titleTokens.length / 2) {
      return {
        status: "warning",
        evidence: `${matched.length} of ${titleTokens.length} title tokens appear in the first 200 words.`,
        limitations: "Heuristic. Advisory only.",
        manualReview: true,
      };
    }
    return {
      status: "pass",
      evidence: `${matched.length} of ${titleTokens.length} title tokens appear in the first 200 words.`,
      limitations: "Heuristic.",
      manualReview: false,
    };
  },
};

/**
 * A4 — Canonical URL matches the page's own URL.
 */
export const A4 = {
  id: "A4",
  description: "Canonical URL matches the page URL.",
  recommendationId: null,
  evaluate(page) {
    if (!page.canonical) {
      return {
        status: "fail",
        evidence: "No <link rel=\"canonical\"> found.",
        limitations: null,
        manualReview: false,
      };
    }
    const normalize = (u) => u.replace(/\/+$/, "") || "/";
    const pageUrlNorm = normalize(page.url);
    const canonicalNorm = normalize(page.canonical);
    if (pageUrlNorm === canonicalNorm) {
      return {
        status: "pass",
        evidence: `Canonical matches: ${page.canonical}`,
        limitations: null,
        manualReview: false,
      };
    }
    return {
      status: "fail",
      evidence: `Canonical is ${page.canonical}, page is ${page.url}.`,
      limitations: null,
      manualReview: false,
    };
  },
};

/**
 * E1 — Heading levels nest correctly (no h1 -> h3 without h2).
 */
export const E1 = {
  id: "E1",
  description: "Heading levels are strictly nested.",
  recommendationId: null,
  evaluate(page) {
    const seq = page.headings.map((h) => h.level);
    const skips = [];
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] > seq[i - 1] + 1) {
        skips.push(`h${seq[i - 1]} -> h${seq[i]}`);
      }
    }
    if (skips.length === 0) {
      return {
        status: "pass",
        evidence: "No heading-level skips.",
        limitations: null,
        manualReview: false,
      };
    }
    if (skips.length === 1) {
      return {
        status: "warning",
        evidence: `1 heading-level skip: ${skips[0]}.`,
        limitations: "One skip is common; multiple indicate structural inconsistency.",
        manualReview: true,
      };
    }
    return {
      status: "warning",
      evidence: `${skips.length} heading-level skips: ${skips.join(", ")}.`,
      limitations: "Multiple skips indicate structural inconsistency.",
      manualReview: true,
    };
  },
};

/**
 * E2 — At least three sub-topics (h2 or h3).
 */
export const E2 = {
  id: "E2",
  description: "At least three sub-topics.",
  recommendationId: null,
  evaluate(page) {
    const count = page.headings.filter((h) => h.level === 2 || h.level === 3).length;
    if (count >= 3) {
      return {
        status: "pass",
        evidence: `${count} sub-topic headings.`,
        limitations: null,
        manualReview: false,
      };
    }
    if (count === 2) {
      return {
        status: "warning",
        evidence: "2 sub-topic headings.",
        limitations: "Sub-topic count is a heuristic, not a requirement.",
        manualReview: true,
      };
    }
    return {
      status: "warning",
      evidence: `${count} sub-topic heading(s).`,
      limitations: "Sub-topic count is a heuristic, not a requirement.",
      manualReview: true,
    };
  },
};

/**
 * G1 — Tool page has valid SoftwareApplication JSON-LD.
 */
export const G1 = {
  id: "G1",
  description: "Valid SoftwareApplication JSON-LD on tool pages.",
  recommendationId: null,
  evaluate(page) {
    if (page.type !== "tool") {
      return {
        status: "not-applicable",
        evidence: `G1 applies to tools; page type is ${page.type}.`,
        limitations: null,
        manualReview: false,
      };
    }
    const found = page.jsonLd.find(
      (b) => b && b["@type"] === "SoftwareApplication",
    );
    if (!found) {
      return {
        status: "fail",
        evidence: "No SoftwareApplication JSON-LD.",
        limitations: null,
        manualReview: false,
      };
    }
    const missing = ["name", "description"].filter((k) => !found[k]);
    if (missing.length > 0) {
      return {
        status: "warning",
        evidence: `SoftwareApplication JSON-LD is missing: ${missing.join(", ")}.`,
        limitations: "Missing optional fields reduce entity clarity.",
        manualReview: true,
      };
    }
    return {
      status: "pass",
      evidence: "SoftwareApplication JSON-LD is present with name and description.",
      limitations: null,
      manualReview: false,
    };
  },
};

/**
 * G2 — Guide page has valid Article JSON-LD.
 */
export const G2 = {
  id: "G2",
  description: "Valid Article JSON-LD on guide pages.",
  recommendationId: null,
  evaluate(page) {
    if (page.type !== "guide") {
      return {
        status: "not-applicable",
        evidence: `G2 applies to guides; page type is ${page.type}.`,
        limitations: null,
        manualReview: false,
      };
    }
    const found = page.jsonLd.find((b) => b && b["@type"] === "Article");
    if (!found) {
      return {
        status: "fail",
        evidence: "No Article JSON-LD.",
        limitations: null,
        manualReview: false,
      };
    }
    const missing = ["headline", "description"].filter((k) => !found[k]);
    if (missing.length > 0) {
      return {
        status: "warning",
        evidence: `Article JSON-LD is missing: ${missing.join(", ")}.`,
        limitations: "Missing optional fields reduce entity clarity.",
        manualReview: true,
      };
    }
    return {
      status: "pass",
      evidence: "Article JSON-LD is present with headline and description.",
      limitations: null,
      manualReview: false,
    };
  },
};

/**
 * H1 — Page is in sitemap.xml.
 * This is a site-level check (needs both sitemap and page list).
 */
export const H1 = {
  id: "H1",
  description: "Page is present in sitemap.xml.",
  recommendationId: null,
  evaluateAll(pages, context = {}) {
    const sitemapUrls = context.sitemapUrls ?? [];
    const results = new Map();
    const sitemapSet = new Set(sitemapUrls.map((u) => u.replace(/\/+$/, "") || "/"));
    for (const page of pages) {
      const norm = page.url.replace(/\/+$/, "") || "/";
      if (sitemapSet.has(norm)) {
        results.set(page.url, { status: "pass", evidence: "Present in sitemap.", limitations: null, manualReview: false });
      } else {
        results.set(page.url, { status: "warning", evidence: "Not present in sitemap.", limitations: "Home, directory, and legal pages may not be sitemapped in all configurations.", manualReview: true });
      }
    }
    return results;
  },
};

/**
 * H2 — Page is not blocked by robots.txt.
 */
export const H2 = {
  id: "H2",
  description: "Page is not blocked by robots.txt.",
  recommendationId: null,
  evaluateAll(pages, context = {}) {
    const robotsTxt = context.robotsTxt ?? "";
    const results = new Map();
    const disallowPaths = [];
    let inUserAgent = false;
    for (const rawLine of robotsTxt.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, "").trim();
      if (!line) continue;
      const [keyRaw, ...rest] = line.split(":");
      const key = keyRaw.trim().toLowerCase();
      const value = rest.join(":").trim();
      if (key === "user-agent") {
        inUserAgent = value === "*";
      } else if (key === "disallow" && inUserAgent) {
        disallowPaths.push(value);
      }
    }
    for (const page of pages) {
      const path = page.url.replace(/^https:\/\/[^/]+/, "");
      const blocked = disallowPaths.some((d) => d.length > 0 && (path === d || path.startsWith(d)));
      results.set(page.url, blocked
        ? { status: "fail", evidence: `Blocked by Disallow: ${path}`, limitations: null, manualReview: false }
        : { status: "pass", evidence: "Not blocked by robots.txt.", limitations: null, manualReview: false });
    }
    return results;
  },
};

/**
 * J1–J5 — Crawler policy checks against robots.txt.
 * Site-level. One result per check.
 */
function makeCrawlerCheck(id, description, crawler) {
  return {
    id,
    description,
    recommendationId: null,
    evaluateSite(robotsTxt) {
      let currentAgent = null;
      let blocked = false;
      for (const rawLine of robotsTxt.split(/\r?\n/)) {
        const line = rawLine.replace(/#.*$/, "").trim();
        if (!line) continue;
        const [keyRaw, ...rest] = line.split(":");
        const key = keyRaw.trim().toLowerCase();
        const value = rest.join(":").trim();
        if (key === "user-agent") {
          currentAgent = value;
        } else if (key === "disallow" && currentAgent === crawler && value === "/") {
          blocked = true;
        }
      }
      return blocked
        ? {
            status: "fail",
            evidence: `${crawler} is blocked by Disallow: / in robots.txt.`,
            limitations: "Site-wide policy. Review intent.",
            manualReview: false,
          }
        : {
            status: "pass",
            evidence: `${crawler} is not blocked.`,
            limitations: null,
            manualReview: false,
          };
    },
  };
}

export const J1 = makeCrawlerCheck("J1", "OAI-SearchBot not blocked.", "OAI-SearchBot");
export const J2 = makeCrawlerCheck("J2", "PerplexityBot not blocked.", "PerplexityBot");
export const J3 = makeCrawlerCheck("J3", "Claude-SearchBot not blocked.", "Claude-SearchBot");
export const J4 = makeCrawlerCheck("J4", "Meta-WebIndexer not blocked.", "Meta-WebIndexer");

export const J5 = {
  id: "J5",
  description: "DisallowExtended presence (advisory).",
  recommendationId: null,
  evaluateSite(robotsTxt) {
    const present = /DisallowExtended\s*:/i.test(robotsTxt);
    return present
      ? {
          status: "warning",
          evidence: "DisallowExtended is present in robots.txt.",
          limitations: "This is an opt-out from AI training and grounding. Review policy intent.",
          manualReview: true,
        }
      : {
          status: "pass",
          evidence: "DisallowExtended is not present (opt-in to training/grounding).",
          limitations: null,
          manualReview: false,
        };
  },
};

export const buildPageChecks = [A2, A3, A4, E1, E2, G1, G2];
export const buildSiteChecks = [H1, H2, J1, J2, J3, J4, J5];