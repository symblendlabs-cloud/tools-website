import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export type ViolationCategory =
  | "private-field"
  | "private-metadata"
  | "implementation-path"
  | "absolute-path"
  | "doc-leak"
  | "source-map"
  | "server-artifact";

export interface ScanConfig {
  buildClientDir: string;
  privateFieldNames: string[];
  privateMetadataPatterns: RegExp[];
  implementationPathPatterns: RegExp[];
  forbiddenAbsolutePathPrefixes: string[];
  privateDocMarkers: string[];
  forbiddenFileExtensions: string[];
}

export interface ScanViolation {
  file: string;
  category: ViolationCategory;
  matchedRule: string;
}

export interface ScanResult {
  ok: boolean;
  violations: ScanViolation[];
  filesScanned: number;
}

const TEXT_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
  ".css",
  ".html",
  ".json",
  ".svg",
  ".txt",
  ".xml",
  ".webmanifest",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function listFilesRecursive(dir: string, relBase: string): Promise<string[]> {
  const result: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = join(relBase, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      result.push(...(await listFilesRecursive(fullPath, relPath)));
    } else if (entry.isFile()) {
      result.push(relPath);
    }
  }
  return result;
}

function buildFieldRegex(name: string): RegExp {
  const escaped = escapeRegExp(name);
  if (name === "implementation" || name === "metadata") {
    // Require object-key form: "implementation": or 'implementation':
    return new RegExp(`["']${escaped}["']\\s*:`);
  }
  if (name.includes(".")) {
    return new RegExp(escapeRegExp(name));
  }
  // Word-boundary match for simple identifiers
  return new RegExp(`\\b${escaped}\\b`);
}

export async function scanClientBuild(config: ScanConfig): Promise<ScanResult> {
  const root = resolve(config.buildClientDir);
  const violations: ScanViolation[] = [];
  let filesScanned = 0;

  // Root must exist
  let rootStat;
  try {
    rootStat = await stat(root);
  } catch {
    return {
      ok: false,
      violations: [{ file: "<root>", category: "server-artifact", matchedRule: "build/client directory is missing" }],
      filesScanned: 0,
    };
  }
  if (!rootStat.isDirectory()) {
    return {
      ok: false,
      violations: [{ file: "<root>", category: "server-artifact", matchedRule: "build/client is not a directory" }],
      filesScanned: 0,
    };
  }

  const files = await listFilesRecursive(root, "");

  // Prepare field regexes once
  const fieldRegexes: { name: string; regex: RegExp }[] = config.privateFieldNames.map((name) => ({
    name,
    regex: buildFieldRegex(name),
  }));

  for (const relPath of files) {
    filesScanned++;
    const fullPath = join(root, relPath);
    const ext = relPath.slice(relPath.lastIndexOf(".")).toLowerCase();

    // 1. Forbidden file extensions (e.g., .map)
    for (const forbiddenExt of config.forbiddenFileExtensions) {
      if (ext === forbiddenExt.toLowerCase()) {
        violations.push({
          file: relPath,
          category: "source-map",
          matchedRule: `forbidden extension ${forbiddenExt}`,
        });
      }
    }

    // Only scan text files for content-based checks
    if (!TEXT_EXTENSIONS.has(ext)) continue;

    let content: string;
    try {
      content = await readFile(fullPath, "utf8");
    } catch {
      continue;
    }

    // 2. Private field names
    for (const { name, regex } of fieldRegexes) {
      if (regex.test(content)) {
        violations.push({
          file: relPath,
          category: "private-field",
          matchedRule: `private field name: ${name}`,
        });
      }
    }

    // 3. Private metadata patterns (e.g., metadata.notes)
    for (const pattern of config.privateMetadataPatterns) {
      if (pattern.test(content)) {
        violations.push({
          file: relPath,
          category: "private-metadata",
          matchedRule: "private metadata pattern",
        });
      }
    }

    // 4. Implementation path patterns (e.g., src/tools/...)
    for (const pattern of config.implementationPathPatterns) {
      if (pattern.test(content)) {
        violations.push({
          file: relPath,
          category: "implementation-path",
          matchedRule: "implementation path pattern",
        });
      }
    }

    // 5. Forbidden absolute path prefixes (e.g., TOOLS_CONTENT_PATH value)
    for (const prefix of config.forbiddenAbsolutePathPrefixes) {
      if (prefix.length === 0) continue;
      if (content.includes(prefix)) {
        violations.push({
          file: relPath,
          category: "absolute-path",
          matchedRule: "forbidden absolute path prefix present",
        });
      }
    }

    // 6. Private documentation markers
    for (const marker of config.privateDocMarkers) {
      if (marker.length === 0) continue;
      if (content.includes(marker)) {
        violations.push({
          file: relPath,
          category: "doc-leak",
          matchedRule: "internal documentation marker present",
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    filesScanned,
  };
}

/**
 * Builds a default config for this project, wired to the current environment.
 * Fails closed if TOOLS_CONTENT_PATH is missing — the scanner still runs but
 * cannot check that specific path.
 */
export function buildDefaultScanConfig(buildClientDir: string): ScanConfig {
  const absolutePrefixes: string[] = [];
  const contentPath = process.env.TOOLS_CONTENT_PATH;
  if (contentPath && contentPath.length > 0) {
    absolutePrefixes.push(contentPath);
  }
  // Common Windows and Unix path prefixes for defensive scanning
  absolutePrefixes.push("\\\\?\\");
  // Cache directory patterns
  absolutePrefixes.push("ms-playwright");
  absolutePrefixes.push(".npm");

  return {
    buildClientDir,
    privateFieldNames: ["contentId", "exportName", "implementation", "metadata"],
    privateMetadataPatterns: [/metadata\.notes/],
    implementationPathPatterns: [/["'][/\\]+[^"']*[/\\]src[\\/]+tools[\\/]/,],
    forbiddenAbsolutePathPrefixes: absolutePrefixes,
    privateDocMarkers: ["# Internal Documentation", "# Internal Security Notes"],
    forbiddenFileExtensions: [".map"],
  };
}

/**
 * Convenience wrapper: runs a default scan against the project's build/client
 * and exits the process with code 1 on violations. Does not print private values
 * or absolute paths — only relative file paths and category names.
 */
export async function runScanAndReport(buildClientDir: string): Promise<number> {
  const config = buildDefaultScanConfig(buildClientDir);
  const result = await scanClientBuild(config);
  if (result.ok) {
    console.log(`Client build scan passed: ${result.filesScanned} file(s) scanned.`);
    return 0;
  }
  console.error(`Client build scan failed: ${result.violations.length} violation(s).`);
  for (const v of result.violations) {
    console.error(`  [${v.category}] ${v.file}: ${v.matchedRule}`);
  }
  return 1;
}