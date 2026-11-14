# GEO Analyzer — Phase 2A

Independent from SEO. Analyzes Chifral's public content and produces a structured JSON report. Does not modify the site, does not touch `robots.txt`, does not touch the build pipeline.

## What it does

Runs five checks against the public content projection (`getSiteContent()`):

| ID | Check | Semantics |
|---|---|---|
| A1 | Title and description exist | Missing values fail; length observations are warnings |
| B3 | Duplicate page descriptions | Warning per page in a duplicate group |
| F1 | FAQ availability | Informational only; never fails |
| F2 | FAQ answer lengths (advisory) | Warning if any answer is under 40 words |
| I1 | Publication or modification dates | `not-applicable` when dates are not exposed |

No numerical score. Page classification is `no-blocking-findings`, `review-recommended`, or `blocking-findings`. These describe analyzer findings, not AI citation probability.

## How to run

Set the content path and invoke via `tsx`:

```powershell
Set-Location "D:\ad sense\Tech\tools-website"
$env:TOOLS_CONTENT_PATH = "D:\ad sense\Tech\tools-content"
npx tsx geo/analyzer/cli.mjs --mode=source

## Analyzer — build mode (Phase 2B)

Analyzes the actual prerendered HTML in `build/client/`. Uses `jsdom` (already installed) as the HTML parser. Does not touch `private/`, does not touch `load-site-content.ts`, does not modify the build.

Prerequisites: run `npm run build` first so `build/client/` exists.

```powershell
Set-Location "D:\ad sense\Tech\tools-website"
npx tsx geo/analyzer/cli.mjs --mode=build

## Automatic build-mode analysis (Phase 3A)

The production build (`scripts/build-production.mjs`) runs the build-mode analyzer automatically after the privacy scan and writes the report to `build/geo-report.json`.

- **Report location:** `build/geo-report.json` — sibling of `build/client/`, **not** deployed.
- **Non-blocking:** any GEO failure (missing build directory, malformed sitemap, analyzer error, write error) is caught and printed as `GEO ANALYSIS WARNING: <message>`. The production build continues and exits successfully.
- **Blocking findings:** if the report contains any page classified as `blocking-findings`, a `::warning::` is emitted in the build log with the count and report path. The build does **not** fail. GEO findings are advisory.
- **Build metadata:** the commit SHA is printed in the build log (from `CF_PAGES_COMMIT_SHA` or `GITHUB_SHA` when available). The report JSON schema is unchanged — the SHA is not added to the JSON.
- **Source mode is not invoked during the build.** Source mode requires `TOOLS_CONTENT_PATH` and `tsx`, which are not guaranteed in the Cloudflare build environment. Source mode remains a developer tool invoked manually via `npx tsx geo/analyzer/cli.mjs --mode=source`.

To inspect the report after a build, either:

- Read the summary in the Cloudflare Pages build log.
- Download the build output and open `build/geo-report.json`.
- Re-run the analyzer locally against the same `build/client/`: `npx tsx geo/analyzer/cli.mjs --mode=build`.