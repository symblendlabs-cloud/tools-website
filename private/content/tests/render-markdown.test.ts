import { describe, it, expect } from "vitest";
import { renderMarkdownToSafeHtml } from "../render-markdown";

describe("renderMarkdownToSafeHtml", () => {
  it("renders headings, paragraphs, lists, code blocks", async () => {
    const html = await renderMarkdownToSafeHtml(
      "# Title\n\nParagraph.\n\n- a\n- b\n\n```js\nconst x = 1;\n```",
    );
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<p>Paragraph.</p>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<code");
  });

  it("renders GFM tables", async () => {
    const html = await renderMarkdownToSafeHtml("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table>");
  });

  it("sanitizes raw HTML script", async () => {
    const html = await renderMarkdownToSafeHtml(
      "<script>alert(1)</script>\n\nSafe paragraph.",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("Safe paragraph.");
  });

  it("removes javascript: URLs", async () => {
    const html = await renderMarkdownToSafeHtml("[click](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("removes unsafe onclick attributes from raw HTML", async () => {
    const html = await renderMarkdownToSafeHtml(
      '<a href="/safe" onclick="alert(1)">link</a>',
    );
    expect(html).not.toContain("onclick");
  });

  it("rejects rendered images", async () => {
    await expect(
      renderMarkdownToSafeHtml("![alt](https://example.com/x.png)"),
    ).rejects.toThrow(/img/);
  });

  // ─── External link handling ─────────────────────────────────────

  it("adds target=_blank and rel=noopener noreferrer to external HTTPS links", async () => {
    const html = await renderMarkdownToSafeHtml(
      "[YAML spec](https://yaml.org/spec/1.2.2/)",
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="https://yaml.org/spec/1.2.2/"');
  });

  it("adds target=_blank and rel=noopener noreferrer to external HTTP links", async () => {
    const html = await renderMarkdownToSafeHtml(
      "[example](http://example.com/path)",
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("does not add target or rel to internal relative links", async () => {
    const html = await renderMarkdownToSafeHtml(
      "[internal](/tools/json-yaml-converter)",
    );
    expect(html).toContain('href="/tools/json-yaml-converter"');
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain('rel="noopener noreferrer"');
  });

  it("does not add target or rel to anchor links", async () => {
    const html = await renderMarkdownToSafeHtml("[jump](#section)");
    expect(html).toContain('href="#section"');
    expect(html).not.toContain('target="_blank"');
  });

  it("does not add target or rel to mailto links", async () => {
    const html = await renderMarkdownToSafeHtml("[email](mailto:test@example.com)");
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain('rel="noopener noreferrer"');
  });

  it("does not add target or rel to tel links", async () => {
    const html = await renderMarkdownToSafeHtml("[call](tel:+1234567890)");
    expect(html).not.toContain('target="_blank"');
  });

  it("does not add target to javascript: links that survived sanitization (should not occur)", async () => {
    // javascript: URLs are removed by rehype-sanitize; if any survive, they
    // must not receive target=_blank.
    const html = await renderMarkdownToSafeHtml(
      "[evil](javascript:alert(1))",
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain('target="_blank"');
  });

  it("does not add target to data: links", async () => {
    const html = await renderMarkdownToSafeHtml(
      "[evil](data:text/html,<script>alert(1)</script>)",
    );
    expect(html).not.toContain('target="_blank"');
  });

  it("handles mixed internal and external links", async () => {
    const html = await renderMarkdownToSafeHtml(
      "[internal](/tools) and [external](https://example.com)",
    );
    // Both links render
    expect(html).toContain('href="/tools"');
    expect(html).toContain('href="https://example.com"');
    // Only the external one has target
    const externalCount = (html.match(/target="_blank"/g) || []).length;
    expect(externalCount).toBe(1);
  });
});