import { describe, it, expect } from "vitest";
import { A2, A3, A4, E1, E2, G1, G2, H1, H2 } from "../checks-build.mjs";

function page(overrides = {}) {
  return {
    url: "https://example.com/tools/foo/",
    type: "tool",
    title: "Foo Tool",
    description: "A tool.",
    canonical: "https://example.com/tools/foo/",
    headings: [
      { level: 1, text: "Foo Tool" },
      { level: 2, text: "Section A" },
      { level: 2, text: "Section B" },
      { level: 2, text: "Section C" },
    ],
    links: [],
    jsonLd: [{ "@type": "SoftwareApplication", name: "Foo", description: "desc" }],
    mainText: "Foo Tool is a tool. Section A. Section B. Section C.",
    preCount: 1,
    ...overrides,
  };
}

describe("A2 — single H1 and H2", () => {
  it("passes with one h1 and multiple h2", () => {
    expect(A2.evaluate(page()).status).toBe("pass");
  });
  it("fails with no h1", () => {
    expect(A2.evaluate(page({ headings: [{ level: 2, text: "X" }] })).status).toBe("fail");
  });
  it("warns with multiple h1", () => {
    expect(A2.evaluate(page({ headings: [{ level: 1, text: "A" }, { level: 1, text: "B" }, { level: 2, text: "X" }] })).status).toBe("warning");
  });
  it("warns with no h2", () => {
    expect(A2.evaluate(page({ headings: [{ level: 1, text: "A" }] })).status).toBe("warning");
  });
});

describe("A3 — title tokens early in main text", () => {
  it("passes when title tokens appear", () => {
    expect(A3.evaluate(page()).status).toBe("pass");
  });
  it("warns when no title tokens appear", () => {
    expect(A3.evaluate(page({ mainText: "unrelated content" })).status).toBe("warning");
  });
});

describe("A4 — canonical matches", () => {
  it("passes when canonical matches", () => {
    expect(A4.evaluate(page()).status).toBe("pass");
  });
  it("fails when canonical differs", () => {
    expect(A4.evaluate(page({ canonical: "https://example.com/tools/bar/" })).status).toBe("fail");
  });
  it("fails when canonical is missing", () => {
    expect(A4.evaluate(page({ canonical: null })).status).toBe("fail");
  });
});

describe("E1 — heading nesting", () => {
  it("passes with strict nesting", () => {
    expect(E1.evaluate(page({ headings: [{ level: 1, text: "A" }, { level: 2, text: "B" }, { level: 3, text: "C" }] })).status).toBe("pass");
  });
  it("warns with a skip", () => {
    expect(E1.evaluate(page({ headings: [{ level: 1, text: "A" }, { level: 3, text: "C" }] })).status).toBe("warning");
  });
});

describe("E2 — sub-topic count", () => {
  it("passes with three sub-topics", () => {
    expect(E2.evaluate(page()).status).toBe("pass");
  });
  it("warns with two sub-topics", () => {
    expect(E2.evaluate(page({ headings: [{ level: 1, text: "A" }, { level: 2, text: "B" }, { level: 2, text: "C" }] })).status).toBe("warning");
  });
});

describe("G1 — SoftwareApplication JSON-LD", () => {
  it("passes for tool with valid JSON-LD", () => {
    expect(G1.evaluate(page()).status).toBe("pass");
  });
  it("fails for tool with no JSON-LD", () => {
    expect(G1.evaluate(page({ jsonLd: [] })).status).toBe("fail");
  });
  it("is not-applicable for guide", () => {
    expect(G1.evaluate(page({ type: "guide" })).status).toBe("not-applicable");
  });
});

describe("G2 — Article JSON-LD", () => {
  it("passes for guide with valid JSON-LD", () => {
    expect(G2.evaluate(page({ type: "guide", jsonLd: [{ "@type": "Article", headline: "H", description: "D" }] })).status).toBe("pass");
  });
  it("fails for guide with no JSON-LD", () => {
    expect(G2.evaluate(page({ type: "guide", jsonLd: [] })).status).toBe("fail");
  });
  it("is not-applicable for tool", () => {
    expect(G2.evaluate(page()).status).toBe("not-applicable");
  });
});

// ─── H1 — sitemap presence ───────────────────────────────────────
describe("H1 — sitemap presence", () => {
  const pages = [
    { url: "https://example.com/", type: "home" },
    { url: "https://example.com/tools/foo/", type: "tool" },
    { url: "https://example.com/about/", type: "page" },
  ];

  it("passes when the page URL is present in the sitemap (trailing slash)", () => {
    const sitemapUrls = [
      "https://example.com/",
      "https://example.com/tools/foo/",
      "https://example.com/about/",
    ];
    const results = H1.evaluateAll(pages, { sitemapUrls });
    expect(results.get("https://example.com/").status).toBe("pass");
    expect(results.get("https://example.com/tools/foo/").status).toBe("pass");
    expect(results.get("https://example.com/about/").status).toBe("pass");
  });

  it("passes when sitemap URL and page URL differ only by trailing slash", () => {
    const sitemapUrls = [
      "https://example.com",
      "https://example.com/tools/foo",
      "https://example.com/about",
    ];
    const results = H1.evaluateAll(pages, { sitemapUrls });
    expect(results.get("https://example.com/").status).toBe("pass");
    expect(results.get("https://example.com/tools/foo/").status).toBe("pass");
    expect(results.get("https://example.com/about/").status).toBe("pass");
  });

  it("warns when a page URL is absent from the sitemap", () => {
    const sitemapUrls = ["https://example.com/"];
    const results = H1.evaluateAll(pages, { sitemapUrls });
    expect(results.get("https://example.com/").status).toBe("pass");
    expect(results.get("https://example.com/tools/foo/").status).toBe("warning");
    expect(results.get("https://example.com/about/").status).toBe("warning");
  });

  it("warns when the sitemap contains a different origin", () => {
    const sitemapUrls = ["https://other.example/tools/foo/"];
    const results = H1.evaluateAll(pages, { sitemapUrls });
    expect(results.get("https://example.com/tools/foo/").status).toBe("warning");
  });

  it("warns for every page when the sitemap is empty", () => {
    const results = H1.evaluateAll(pages, { sitemapUrls: [] });
    for (const p of pages) {
      expect(results.get(p.url).status).toBe("warning");
    }
  });

  it("handles missing sitemapUrls context by treating it as empty", () => {
    const results = H1.evaluateAll(pages, {});
    for (const p of pages) {
      expect(results.get(p.url).status).toBe("warning");
    }
  });

  it("parses the real sitemap XML format and matches correctly", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/tools/foo/</loc></url>
</urlset>`;
    const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
    const sitemapUrls = [];
    let m;
    while ((m = re.exec(xml)) !== null) sitemapUrls.push(m[1]);
    expect(sitemapUrls).toEqual([
      "https://example.com/",
      "https://example.com/tools/foo/",
    ]);
    const results = H1.evaluateAll(pages, { sitemapUrls });
    expect(results.get("https://example.com/").status).toBe("pass");
    expect(results.get("https://example.com/tools/foo/").status).toBe("pass");
    expect(results.get("https://example.com/about/").status).toBe("warning");
  });
});

// ─── H2 — robots.txt blocking ────────────────────────────────────
describe("H2 — robots.txt blocking", () => {
  const pages = [
    { url: "https://example.com/", type: "home" },
    { url: "https://example.com/tools/foo/", type: "tool" },
    { url: "https://example.com/about/", type: "page" },
  ];

  it("passes when no disallow rules match", () => {
    const robotsTxt = "User-agent: *\nDisallow: /admin\n";
    const results = H2.evaluateAll(pages, { robotsTxt });
    expect(results.get("https://example.com/").status).toBe("pass");
    expect(results.get("https://example.com/tools/foo/").status).toBe("pass");
    expect(results.get("https://example.com/about/").status).toBe("pass");
  });

  it("fails when the page path is disallowed", () => {
    const robotsTxt = "User-agent: *\nDisallow: /tools\n";
    const results = H2.evaluateAll(pages, { robotsTxt });
    expect(results.get("https://example.com/").status).toBe("pass");
    expect(results.get("https://example.com/tools/foo/").status).toBe("fail");
    expect(results.get("https://example.com/about/").status).toBe("pass");
  });

  it("fails on exact-path Disallow", () => {
    const robotsTxt = "User-agent: *\nDisallow: /tools/foo/\n";
    const results = H2.evaluateAll(pages, { robotsTxt });
    expect(results.get("https://example.com/tools/foo/").status).toBe("fail");
  });

  it("does not block on unrelated path prefixes", () => {
    const robotsTxt = "User-agent: *\nDisallow: /categories\n";
    const results = H2.evaluateAll(pages, { robotsTxt });
    expect(results.get("https://example.com/tools/foo/").status).toBe("pass");
    expect(results.get("https://example.com/about/").status).toBe("pass");
  });

  it("ignores disallow rules scoped to a different user-agent", () => {
    const robotsTxt = "User-agent: SomeBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n";
    const results = H2.evaluateAll(pages, { robotsTxt });
    expect(results.get("https://example.com/").status).toBe("pass");
    expect(results.get("https://example.com/tools/foo/").status).toBe("pass");
  });

  it("passes when robots.txt is empty", () => {
    const results = H2.evaluateAll(pages, { robotsTxt: "" });
    for (const p of pages) {
      expect(results.get(p.url).status).toBe("pass");
    }
  });

  it("treats missing robotsTxt context as empty", () => {
    const results = H2.evaluateAll(pages, {});
    for (const p of pages) {
      expect(results.get(p.url).status).toBe("pass");
    }
  });
});