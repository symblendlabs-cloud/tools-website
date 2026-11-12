import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import type { Root, Element } from "hast";

/**
 * Rehype plugin that adds `target="_blank"` and `rel="noopener noreferrer"`
 * to external HTTP/HTTPS links.
 *
 * Runs AFTER `rehype-sanitize`, so any `href` present at this point has already
 * passed URL sanitization. Links with unsafe schemes (`javascript:`, `data:`,
 * etc.) have already been stripped by the sanitizer — they are not touched
 * here, they simply do not exist anymore.
 *
 * Internal links (relative paths, anchor fragments, mailto:, tel:) are left
 * untouched so they navigate in the same tab.
 */
function rehypeExternalLinksPlugin() {
  return (tree: Root) => {
    const visit = (node: Root | Element): void => {
      if (node.type === "element" && node.tagName === "a") {
        const href = (node.properties?.href as string | undefined) ?? "";
        if (/^https?:\/\//i.test(href)) {
          node.properties = node.properties ?? {};
          node.properties.target = "_blank";
          node.properties.rel = ["noopener", "noreferrer"];
        }
      }
      if ("children" in node && Array.isArray(node.children)) {
        for (const child of node.children) {
          visit(child as Root | Element);
        }
      }
    };
    visit(tree);
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize)
  .use(rehypeExternalLinksPlugin)
  .use(rehypeStringify);

export async function renderMarkdownToSafeHtml(markdown: string): Promise<string> {
  if (typeof markdown !== "string") {
    throw new Error("renderMarkdownToSafeHtml expects a string");
  }
  let result;
  try {
    result = await processor.process(markdown);
  } catch (err) {
    throw new Error(`Markdown rendering failed: ${(err as Error).message}`);
  }
  const html = String(result);
  if (/<img\b/i.test(html)) {
    throw new Error("Rendered HTML contains <img> elements, which are disabled");
  }
  return html;
}