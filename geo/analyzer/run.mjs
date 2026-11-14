/**
 * GEO analyzer core.
 *
 * `runAnalyzer` is loadable under plain Node (`node geo/analyzer/run.mjs`
 * is not used directly; it is imported by cli.mjs and by the production build).
 *
 * Only imports collect-build.mjs statically. collect.mjs (source mode) is
 * loaded lazily so that loading this module under plain Node does not pull in
 * `load-site-content.ts`, which uses directory imports that native ESM cannot
 * resolve. Source mode requires tsx (or Vitest) and is only available when
 * the caller invokes `runAnalyzer({ mode: "source" })`.
 */

import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectFromBuild } from "./collect-build.mjs";
import { buildReport } from "./report.mjs";
import * as checksBuild from "./checks-build.mjs";

const GEO_RECS_PATH = resolve(process.cwd(), "geo", "recommendations.json");

async function loadGeoRegistry() {
  const raw = await readFile(GEO_RECS_PATH, "utf8");
  return JSON.parse(raw);
}

function parseSitemap(xml) {
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, "");
  const urls = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
  let match;
  while ((match = re.exec(withoutComments)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

function readSitemapUrls(buildDir) {
  try {
    const xml = readFileSync(resolve(buildDir, "sitemap.xml"), "utf8");
    return parseSitemap(xml);
  } catch {
    return [];
  }
}

function readRobotsTxt(buildDir) {
  try {
    return readFileSync(resolve(buildDir, "robots.txt"), "utf8");
  } catch {
    return "";
  }
}

/**
 * Run the analyzer.
 *
 * @param {object} [options]
 * @param {"source" | "build"} [options.mode]
 * @param {string} [options.origin]
 * @param {string} [options.buildDir]
 */
export async function runAnalyzer(options = {}) {
  const mode = options.mode ?? "source";
  const origin = options.origin ?? "https://chifral.pages.dev";

  if (mode !== "source" && mode !== "build") {
    throw new Error(
      `runAnalyzer: unsupported mode "${mode}". Use "source" or "build".`,
    );
  }
  if (typeof origin !== "string" || !origin.startsWith("https://")) {
    throw new Error(
      `runAnalyzer: origin must be an HTTPS URL. Received: ${origin}`,
    );
  }

  const geoRegistry = await loadGeoRegistry();

  let pages;
  let pageChecks;
  let siteChecks;
  let siteContext = {};

  if (mode === "source") {
    // Lazy import: only reached when mode is source. Requires tsx/Vitest.
    const [{ collectFromContent }, checksSource] = await Promise.all([
      import("./collect.mjs"),
      import("./checks.mjs"),
    ]);
    ({ pages } = await collectFromContent({ origin }));
    pageChecks = checksSource.allChecks;
    siteChecks = checksSource.siteChecks;
  } else {
    const buildDir =
      options.buildDir ?? resolve(process.cwd(), "build", "client");
    ({ pages } = await collectFromBuild({ buildDir, origin }));
    pageChecks = checksBuild.buildPageChecks;
    siteChecks = checksBuild.buildSiteChecks;
    siteContext = {
      sitemapUrls: readSitemapUrls(buildDir),
      robotsTxt: readRobotsTxt(buildDir),
    };
  }

  return buildReport({
    pages,
    origin,
    geoRegistry,
    mode,
    analyzedAt: new Date().toISOString(),
    pageChecks,
    siteChecks,
    siteContext,
  });
}