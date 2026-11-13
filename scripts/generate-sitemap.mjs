import { readdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const BUILD_CLIENT = resolve(ROOT, "build", "client");
const DEV_PREVIEW_DIR = "__dev-preview";
const NOT_FOUND_DIR = "404";

/**
 * Validate and normalize SITE_ORIGIN.
 * Accepts only a bare HTTPS origin. Rejects credentials, paths, query strings,
 * fragments, whitespace-only values, and non-HTTPS schemes.
 * Returns { ok: true, origin } or { ok: false, error }.
 */
export function validateOrigin(raw) {
  if (typeof raw !== "string") {
    return { ok: false, error: "SITE_ORIGIN is required." };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "SITE_ORIGIN is required." };
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "SITE_ORIGIN is not a valid URL." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "SITE_ORIGIN must use HTTPS." };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, error: "SITE_ORIGIN must not contain credentials." };
  }
  if (url.pathname !== "/") {
    return { ok: false, error: "SITE_ORIGIN must not contain a path." };
  }
  if (url.search !== "") {
    return { ok: false, error: "SITE_ORIGIN must not contain a query string." };
  }
  if (url.hash !== "") {
    return { ok: false, error: "SITE_ORIGIN must not contain a fragment." };
  }

  // url.origin normalizes to scheme://host[:port], no trailing slash,
  // no path, no credentials, no query, no fragment.
  return { ok: true, origin: url.origin };
}

/**
 * Recursively find index.html files under dir, excluding the dev preview
 * and 404 directories.
 */
export async function findIndexFiles(dir, results = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = `${dir}${sep}${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === DEV_PREVIEW_DIR) continue;
      if (entry.name === NOT_FOUND_DIR) continue;
      await findIndexFiles(fullPath, results);
    } else if (entry.isFile() && entry.name === "index.html") {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Convert a full path to build/client/index.html into a URL path.
 * Root index.html maps to "/". Nested index.html maps to its directory path.
 * Existing behavior: root already maps to "/"; this is preserved and
 * covered by regression tests.
 */
export function toUrlPath(fullPath, buildClientDir) {
  const rel = fullPath
    .slice(buildClientDir.length)
    .replace(/^[\\/]+/, "")
    .replace(/(?:^|[\\/])index\.html$/, "")
    .replace(/\\/g, "/");
  if (rel === "") return "/";
  const trimmed = rel.replace(/\/+$/, "");
  return `/${trimmed}/`;
}

/**
 * Deterministic sort: root "/" first, then alphabetical.
 */
export function sortUrls(urls) {
  return [...urls].sort((a, b) => {
    if (a === "/") return -1;
    if (b === "/") return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/**
 * Build the sitemap XML string. Preserves existing format.
 */
export function buildSitemapXml(urls, origin) {
  if (urls.length === 0) {
    throw new Error("No eligible pages found in build/client. Nothing to write.");
  }

  // 1. Normalize each path: root stays "/", everything else gets a single
  //    trailing slash, and internal duplicates are collapsed.
  // 2. Deduplicate via Set.
  // 3. Sort deterministically (root first, then alphabetical).
  const normalizedSet = new Set();
  for (const u of urls) {
    if (u === "/") {
      normalizedSet.add("/");
      continue;
    }
    const stripped = u.replace(/\/+/g, "/").replace(/\/+$/, "");
    normalizedSet.add(`${stripped}/`);
  }

  const sorted = sortUrls(Array.from(normalizedSet));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sorted.map((path) => {
      const loc = path === "/" ? `${origin}/` : `${origin}${path}`;
      return `  <url><loc>${loc}</loc></url>`;
    }),
    "</urlset>",
    "",
  ].join("\n");
}
/**
 * Build robots.txt content. Preserves existing format.
 */
export function buildRobotsTxt(origin) {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /__dev-preview",
    "Disallow: /404",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

/**
 * Generate sitemap.xml and robots.txt into the given buildClientDir.
 * Exported for tests. Does not call process.exit.
 */
export async function generate({ buildClientDir, origin }) {
  const indexFiles = await findIndexFiles(buildClientDir);
  const urls = indexFiles
    .map((f) => toUrlPath(f, buildClientDir))
    .filter((p) => !p.startsWith("/__dev") && p !== "/404" && p !== "/404/");

  if (urls.length === 0) {
    throw new Error("No eligible pages found in build/client. Nothing to write.");
  }

  const sitemapXml = buildSitemapXml(urls, origin);
  const robotsTxt = buildRobotsTxt(origin);

  await writeFile(resolve(buildClientDir, "sitemap.xml"), sitemapXml, "utf8");
  await writeFile(resolve(buildClientDir, "robots.txt"), robotsTxt, "utf8");

  return { urlCount: urls.length };
}

async function main() {
  const validation = validateOrigin(process.env.SITE_ORIGIN);
  if (!validation.ok) {
    console.error(validation.error);
    console.error(
      "Set SITE_ORIGIN to the production origin (e.g., https://example.com) and re-run.",
    );
    process.exit(1);
  }

  try {
    const { urlCount } = await generate({
      buildClientDir: BUILD_CLIENT,
      origin: validation.origin,
    });
    console.log(
      `Sitemap generated: ${urlCount} URLs. robots.txt written. Origin: ${validation.origin}`,
    );
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

// Entry-point guard: only run main() when this file is executed directly.
const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((err) => {
    console.error("Sitemap generation failed:", err.message);
    process.exit(1);
  });
}