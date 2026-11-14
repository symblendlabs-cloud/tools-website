/**
 * Content collector — build mode.
 *
 * Reads build/client/**.html using node:fs/promises and jsdom via html.mjs.
 * Does not touch private/, does not touch load-site-content.ts.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { extractFromHtml } from "./html.mjs";

const EXCLUDED_DIRS = new Set(["__dev-preview", "404"]);

/**
 * Walk build/client recursively and return every .html file path.
 */
async function collectHtmlFiles(dir, results = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      await collectHtmlFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Derive a page URL from a build/client HTML file path.
 *   build/client/index.html -> /
 *   build/client/tools/json-yaml-converter/index.html -> /tools/json-yaml-converter/
 *   build/client/__spa-fallback.html -> /__spa-fallback.html (filtered out later)
 */
function fileToUrl(filePath, buildClientDir, origin) {
  const rel = relative(buildClientDir, filePath).replace(/\\/g, "/");
  if (rel === "index.html") return `${origin}/`;
  if (rel.endsWith("/index.html")) {
    return `${origin}/${rel.slice(0, -"/index.html".length)}/`;
  }
  // SPA fallback or other non-index HTML — not a real page.
  return null;
}

/**
 * Classify a page by URL pattern.
 */
function classifyUrl(url) {
  if (url === null) return null;
  const path = url.replace(/^https:\/\/[^/]+/, "");
  if (path === "/") return "home";
  if (/^\/tools\/[^/]+\/$/.test(path)) return "tool";
  if (/^\/guides\/[^/]+\/$/.test(path)) return "guide";
  if (/^\/categories\/[^/]+\/$/.test(path)) return "category";
  if (/^\/tools\/$/.test(path)) return "tools-directory";
  if (/^\/guides\/$/.test(path)) return "guides-directory";
  if (/^\/categories\/$/.test(path)) return "categories-directory";
  return "page";
}

/**
 * Read and extract every HTML page in build/client.
 *
 * @param {object} options
 * @param {string} options.buildDir - absolute path to build/client
 * @param {string} options.origin
 * @returns {Promise<{ pages: object[] }>}
 */
export async function collectFromBuild({ buildDir, origin }) {
  if (typeof origin !== "string" || !origin.startsWith("https://")) {
    throw new Error(
      `collectFromBuild: origin must be an HTTPS URL. Received: ${origin}`,
    );
  }

  let buildDirStat;
  try {
    buildDirStat = await stat(buildDir);
  } catch {
    throw new Error(
      `collectFromBuild: build directory does not exist: ${buildDir}`,
    );
  }
  if (!buildDirStat.isDirectory()) {
    throw new Error(
      `collectFromBuild: build directory is not a directory: ${buildDir}`,
    );
  }

  const htmlFiles = await collectHtmlFiles(buildDir);
  if (htmlFiles.length === 0) {
    throw new Error(
      `collectFromBuild: no HTML files found under ${buildDir}`,
    );
  }

  const pages = [];
  for (const file of htmlFiles) {
    const url = fileToUrl(file, buildDir, origin);
    if (url === null) continue; // skip SPA fallback and non-index HTML
    const type = classifyUrl(url);
    if (type === null) continue;

    const html = await readFile(file, "utf8");
    const extracted = extractFromHtml(html);

    pages.push({
      url,
      type,
      title: extracted.title,
      description: extracted.description,
      canonical: extracted.canonical,
      headings: extracted.headings,
      links: extracted.links,
      jsonLd: extracted.jsonLd,
      mainText: extracted.mainText,
      preCount: extracted.preCount,
    });
  }

  if (pages.length === 0) {
    throw new Error(
      `collectFromBuild: no eligible public pages found under ${buildDir}`,
    );
  }

  return { pages };
}