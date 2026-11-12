import { readFile, readdir, stat, realpath, lstat } from "node:fs/promises";
import { join, relative, resolve, sep, isAbsolute } from "node:path";

const TOOLS_SUBDIR = "tools";
const ARTICLES_SUBDIR = "articles";

export interface ContentSource {
  root: string;
}

export function resolveContentRoot(): ContentSource {
  const raw = process.env.TOOLS_CONTENT_PATH;
  if (!raw) {
    throw new Error(
      "TOOLS_CONTENT_PATH environment variable is not set. " +
        "It must point to the absolute path of the tools-content repository.",
    );
  }
  if (!isAbsolute(raw)) {
    throw new Error("TOOLS_CONTENT_PATH must be an absolute path.");
  }
  return { root: resolve(raw) };
}

async function canonicalize(fullPath: string, relativePath: string): Promise<string> {
  try {
    return await realpath(fullPath);
  } catch {
    throw new Error(
      `Unable to resolve canonical filesystem path for "${relativePath}".`,
    );
  }
}

export async function assertContentRootAvailable(source: ContentSource): Promise<void> {
  let s;
  try {
    s = await stat(source.root);
  } catch {
    throw new Error("TOOLS_CONTENT_PATH does not point to an accessible directory.");
  }
  if (!s.isDirectory()) {
    throw new Error("TOOLS_CONTENT_PATH must point to a directory.");
  }
}

export async function assertRequiredSource(
  source: ContentSource,
  relativePath: string,
  kind: "directory" | "file",
): Promise<void> {
  const full = resolveInsideRoot(source, relativePath);
  await assertNoSymlink(full, relativePath);
  let s;
  try {
    s = await stat(full);
  } catch {
    throw new Error(`Required content source is missing: "${relativePath}".`);
  }
  if (kind === "directory" && !s.isDirectory()) {
    throw new Error(`Required content source is not a directory: "${relativePath}".`);
  }
  if (kind === "file" && !s.isFile()) {
    throw new Error(`Required content source is not a file: "${relativePath}".`);
  }
  // Verify canonical resolution succeeds and stays under canonical root
  const canonical = await canonicalize(full, relativePath);
  const canonicalRoot = await canonicalize(source.root, "<content-root>");
  const canonicalRootWithSep = canonicalRoot.endsWith(sep)
    ? canonicalRoot
    : canonicalRoot + sep;
  if (canonical !== canonicalRoot && !canonical.startsWith(canonicalRootWithSep)) {
    throw new Error(`Content path escapes the repository root: "${relativePath}".`);
  }
}

export function resolveInsideRoot(source: ContentSource, relativePath: string): string {
  if (relativePath.includes("\0")) {
    throw new Error("Content path contains invalid characters.");
  }
  const normalized = relativePath.replace(/\\/g, "/");
  if (isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`Content path must be relative: "${relativePath}".`);
  }
  const full = resolve(source.root, normalized);
  const rootWithSep = source.root.endsWith(sep) ? source.root : source.root + sep;
  if (full !== source.root && !full.startsWith(rootWithSep)) {
    throw new Error(`Content path escapes the repository root: "${relativePath}".`);
  }
  return full;
}

async function assertNoSymlink(fullPath: string, relativePath: string): Promise<void> {
  let s;
  try {
    s = await lstat(fullPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error(`Unable to inspect content path "${relativePath}".`);
  }
  if (s.isSymbolicLink()) {
    throw new Error(`Symlinked content is not permitted: "${relativePath}".`);
  }
}

async function discoverFiles(
  source: ContentSource,
  dir: string,
  extension: string,
): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return results;
    throw new Error(
      `Unable to read content directory "${relative(source.root, dir).replace(/\\/g, "/")}".`,
    );
  }
  const canonicalRoot = await canonicalize(source.root, "<content-root>");
  const canonicalRootWithSep = canonicalRoot.endsWith(sep)
    ? canonicalRoot
    : canonicalRoot + sep;

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const rel = relative(source.root, fullPath).replace(/\\/g, "/");
    await assertNoSymlink(fullPath, rel);

    if (entry.isDirectory()) {
      // Verify canonical directory stays inside root
      const canonical = await canonicalize(fullPath, rel);
      if (canonical !== canonicalRoot && !canonical.startsWith(canonicalRootWithSep)) {
        throw new Error(`Discovered directory escapes the content root: "${rel}".`);
      }
      results.push(...(await discoverFiles(source, fullPath, extension)));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      const canonical = await canonicalize(fullPath, rel);
      if (canonical !== canonicalRoot && !canonical.startsWith(canonicalRootWithSep)) {
        throw new Error(`Discovered file escapes the content root: "${rel}".`);
      }
      results.push(fullPath);
    }
  }
  return results;
}

export interface LoadedToolContent {
  relativePath: string;
  data: unknown;
}

export interface LoadedArticle {
  relativePath: string;
  raw: string;
}

export async function loadToolContentFiles(
  source: ContentSource,
): Promise<LoadedToolContent[]> {
  const dir = resolveInsideRoot(source, TOOLS_SUBDIR);
  const files = await discoverFiles(source, dir, ".json");
  const results: LoadedToolContent[] = [];
  for (const file of files) {
    const rel = relative(source.root, file).replace(/\\/g, "/");
    // Canonical path was already verified in discoverFiles. Verify again before read.
    await canonicalize(file, rel);
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      throw new Error(`Unable to read content file "${rel}".`);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`${rel}: malformed JSON.`);
    }
    results.push({ relativePath: rel, data });
  }
  return results;
}

export async function loadArticleFiles(
  source: ContentSource,
): Promise<LoadedArticle[]> {
  const dir = resolveInsideRoot(source, ARTICLES_SUBDIR);
  const files = await discoverFiles(source, dir, ".md");
  const results: LoadedArticle[] = [];
  for (const file of files) {
    const rel = relative(source.root, file).replace(/\\/g, "/");
    await canonicalize(file, rel);
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      throw new Error(`Unable to read content file "${rel}".`);
    }
    results.push({ relativePath: rel, raw });
  }
  return results;
}