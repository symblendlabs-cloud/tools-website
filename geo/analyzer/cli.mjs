#!/usr/bin/env node
/**
 * GEO Analyzer CLI.
 *
 * Phase 2A: `--mode=source` reads getSiteContent() via collect.mjs.
 * Phase 2B: `--mode=build` reads build/client/ via collect-build.mjs.
 *
 * The CLI itself is a thin wrapper around runAnalyzer (in run.mjs).
 * Source mode requires tsx (or Vitest) because getSiteContent() uses
 * directory imports that native Node cannot resolve. Build mode runs
 * under plain node.
 */

import { pathToFileURL } from "node:url";
import { runAnalyzer } from "./run.mjs";

export { runAnalyzer };

async function main() {
  const args = process.argv.slice(2);
  let mode = "source";
  let origin = "https://chifral.pages.dev";
  let buildDir;
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--mode=")) mode = args[i].slice("--mode=".length);
    else if (args[i].startsWith("--origin=")) origin = args[i].slice("--origin=".length);
    else if (args[i].startsWith("--build-dir=")) buildDir = args[i].slice("--build-dir=".length);
  }
  try {
    const report = await runAnalyzer({ mode, origin, buildDir });
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } catch (err) {
    process.stderr.write(`geo-analyzer: ${err.message}\n`);
    process.exit(1);
  }
}

const isEntry =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntry) {
  main();
}