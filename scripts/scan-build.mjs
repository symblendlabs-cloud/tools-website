// CLI wrapper for the existing privacy scanner.
//
// The scanner module (private/scanner/scan-client-build.ts) exports
// runScanAndReport(buildClientDir: string): Promise<number> but has no
// top-level invocation. This wrapper calls it against the production
// client build and exits with the returned code (0 = pass, 1 = fail).
//
// It does NOT modify the scanner. It does NOT set TOOLS_CONTENT_PATH —
// the scanner reads that from the environment, and hardcoding a path
// here would embed the very absolute-path leakage the scanner detects.
//
// Node 26 strips types by default; importing a .ts module from .mjs
// requires the explicit .ts extension on the specifier.

import { runScanAndReport } from "../private/scanner/scan-client-build.ts";

const code = await runScanAndReport("build/client");
process.exit(code);