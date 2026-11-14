/**
 * HTML extraction using jsdom (already installed as a devDependency).
 *
 * jsdom is the spec-compliant browser DOM. It does not fabricate elements,
 * it enforces correct nesting, and it exposes textContent / href exactly as
 * a browser would. This is why it is used instead of regex.
 */

import { JSDOM } from "jsdom";

/**
 * Parse an HTML document string.
 *
 * @param {string} html
 * @returns {{ title: string, description: string, canonical: string | null,
 *             headings: { level: number, text: string }[],
 *             links: { href: string, text: string, rel: string | null }[],
 *             jsonLd: object[],
 *             mainText: string,
 *             preCount: number }}
 */
export function extractFromHtml(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const title = doc.querySelector("title")?.textContent?.trim() ?? "";

  const descriptionMeta = doc.querySelector('meta[name="description"]');
  const description = descriptionMeta?.getAttribute("content")?.trim() ?? "";

  const canonicalLink = doc.querySelector('link[rel="canonical"]');
  const canonical = canonicalLink?.getAttribute("href") ?? null;

  const headings = [];
  for (const el of doc.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    headings.push({
      level: Number(el.tagName.slice(1)),
      text: el.textContent?.trim() ?? "",
    });
  }

  const links = [];
  for (const el of doc.querySelectorAll("a[href]")) {
    const href = el.getAttribute("href");
    if (!href) continue;
    links.push({
      href,
      text: el.textContent?.trim() ?? "",
      rel: el.getAttribute("rel"),
    });
  }

  const jsonLd = [];
  for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = el.textContent ?? "";
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed["@graph"])) {
        // Flatten @graph entries so each entity is a top-level item.
        // Checks such as G1 and G2 look for a top-level @type. Without
        // this flattening, entities inside @graph are invisible to them.
        for (const item of parsed["@graph"]) {
          jsonLd.push(item);
        }
      } else {
        jsonLd.push(parsed);
      }
    } catch {
      jsonLd.push({ __parseError: true, raw: raw.slice(0, 500) });
    }
  }

  const main = doc.querySelector("main") ?? doc.body;
  const mainText = main?.textContent?.trim() ?? "";

  const preCount = doc.querySelectorAll("pre").length;

  return { title, description, canonical, headings, links, jsonLd, mainText, preCount };
}