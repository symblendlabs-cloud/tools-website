import { describe, it, expect } from "vitest";
import { extractFromHtml } from "../html.mjs";

describe("extractFromHtml — basic extraction", () => {
  it("extracts title, description, canonical, headings, links, JSON-LD, pre count", () => {
    const html = `<!doctype html>
<html><head>
<title>Test Page</title>
<meta name="description" content="A test page." />
<link rel="canonical" href="https://example.com/test/" />
<script type="application/ld+json">{"@type":"Article","headline":"Test"}</script>
</head><body>
<main>
<h1>Test Page</h1>
<h2>Section</h2>
<h3>Sub</h3>
<p>Some text.</p>
<pre>code block</pre>
<a href="/tools/">Tools</a>
</main>
</body></html>`;
    const r = extractFromHtml(html);
    expect(r.title).toBe("Test Page");
    expect(r.description).toBe("A test page.");
    expect(r.canonical).toBe("https://example.com/test/");
    expect(r.headings).toHaveLength(3);
    expect(r.headings[0]).toEqual({ level: 1, text: "Test Page" });
    expect(r.links).toHaveLength(1);
    expect(r.links[0].href).toBe("/tools/");
    expect(r.jsonLd).toHaveLength(1);
    expect(r.jsonLd[0]["@type"]).toBe("Article");
    expect(r.preCount).toBe(1);
  });

  it("handles missing title and meta description", () => {
    const r = extractFromHtml("<html><head></head><body></body></html>");
    expect(r.title).toBe("");
    expect(r.description).toBe("");
    expect(r.canonical).toBeNull();
    expect(r.headings).toHaveLength(0);
    expect(r.jsonLd).toHaveLength(0);
  });

  it("handles malformed JSON-LD without throwing", () => {
    const html = `<html><head>
<script type="application/ld+json">{not valid json}</script>
</head><body></body></html>`;
    const r = extractFromHtml(html);
    expect(r.jsonLd).toHaveLength(1);
    expect(r.jsonLd[0].__parseError).toBe(true);
  });

  it("ignores headings outside main", () => {
    const html = `<html><body>
<nav><h1>Nav</h1></nav>
<main><h1>Main</h1><h2>Sub</h2></main>
</body></html>`;
    const r = extractFromHtml(html);
    expect(r.headings.length).toBeGreaterThanOrEqual(2);
  });
});

describe("extractFromHtml — standalone JSON-LD", () => {
  it("extracts a standalone Organization schema", () => {
    const html = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Chifral","url":"https://example.com/"}</script>
</head><body></body></html>`;
    const r = extractFromHtml(html);
    expect(r.jsonLd).toHaveLength(1);
    expect(r.jsonLd[0]["@type"]).toBe("Organization");
    expect(r.jsonLd[0]["name"]).toBe("Chifral");
  });

  it("extracts a standalone SoftwareApplication schema", () => {
    const html = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Tool","description":"Desc"}</script>
</head><body></body></html>`;
    const r = extractFromHtml(html);
    expect(r.jsonLd).toHaveLength(1);
    expect(r.jsonLd[0]["@type"]).toBe("SoftwareApplication");
  });

  it("extracts a standalone Article schema", () => {
    const html = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"H","description":"D"}</script>
</head><body></body></html>`;
    const r = extractFromHtml(html);
    expect(r.jsonLd).toHaveLength(1);
    expect(r.jsonLd[0]["@type"]).toBe("Article");
  });

  it("extracts multiple standalone script blocks separately", () => {
    const html = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"A"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"B"}</script>
</head><body></body></html>`;
    const r = extractFromHtml(html);
    expect(r.jsonLd).toHaveLength(2);
    expect(r.jsonLd.map((x) => x["@type"])).toEqual(["Organization", "WebSite"]);
  });
});

describe("extractFromHtml — @graph flattening", () => {
  it("flattens a BreadcrumbList inside @graph", () => {
    const html = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList","itemListElement":[]}]}</script>
</head><body></body></html>`;
    const r = extractFromHtml(html);
    expect(r.jsonLd).toHaveLength(1);
    expect(r.jsonLd[0]["@type"]).toBe("BreadcrumbList");
  });

  it("flattens SoftwareApplication and BreadcrumbList together inside @graph", () => {
    const html = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"SoftwareApplication","name":"Tool","description":"D"},{"@type":"BreadcrumbList","itemListElement":[]}]}</script>
</head><body></body></html>`;
    const r = extractFromHtml(html);
    expect(r.jsonLd).toHaveLength(2);
    expect(r.jsonLd.map((x) => x["@type"])).toEqual([
      "SoftwareApplication",
      "BreadcrumbList",
    ]);
  });

  it("flattens Article and BreadcrumbList together inside @graph", () => {
    const html = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Article","headline":"H","description":"D"},{"@type":"BreadcrumbList","itemListElement":[]}]}</script>
</head><body></body></html>`;
    const r = extractFromHtml(html);
    expect(r.jsonLd).toHaveLength(2);
    expect(r.jsonLd.map((x) => x["@type"])).toEqual([
      "Article",
      "BreadcrumbList",
    ]);
  });

  it("preserves fields of each @graph item", () => {
    const html = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"SoftwareApplication","name":"Tool","applicationCategory":"UtilityApplication"}]}</script>
</head><body></body></html>`;
    const r = extractFromHtml(html);
    expect(r.jsonLd[0]["@type"]).toBe("SoftwareApplication");
    expect(r.jsonLd[0]["name"]).toBe("Tool");
    expect(r.jsonLd[0]["applicationCategory"]).toBe("UtilityApplication");
  });

  it("handles mixed standalone and @graph blocks in the same document", () => {
    const html = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Chifral"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"SoftwareApplication","name":"Tool"},{"@type":"BreadcrumbList"}]}</script>
</head><body></body></html>`;
    const r = extractFromHtml(html);
    expect(r.jsonLd.map((x) => x["@type"])).toEqual([
      "Organization",
      "SoftwareApplication",
      "BreadcrumbList",
    ]);
  });

  it("handles an @graph that is not an array by preserving current behavior", () => {
    // @graph should be an array. If a malformed document has a non-array @graph,
    // fall through to the "no @graph" branch and push the object as-is.
    const html = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":"not-an-array"}</script>
</head><body></body></html>`;
    const r = extractFromHtml(html);
    expect(r.jsonLd).toHaveLength(1);
    expect(r.jsonLd[0]["@graph"]).toBe("not-an-array");
  });
});