import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  validateRegistry,
  type PublicCategory,
} from "../registry";
import {
  buildSiteContent,
  resolveContentRoot,
  type PublicContentOutput,
  type PublicArticle,
  type PublicToolWithContent,
} from "../content";
import {
  getCachedPromise,
  setCachedPromise,
  clearCachedPromise,
} from "./cache-store";

const REGISTRY_DATA_DIR = "private/registry/data";
const TOOLS_REGISTRY_FILE = "tools.json";
const CATEGORIES_REGISTRY_FILE = "categories.json";
const EXPECTED_PACKAGE_NAME = "tools-website";

async function assertWebsiteRoot(): Promise<string> {
  const cwd = process.cwd();

  const packageJsonPath = resolve(cwd, "package.json");
  let packageRaw: string;
  try {
    packageRaw = await readFile(packageJsonPath, "utf8");
  } catch {
    throw new Error(
      "Unable to locate the project root: package.json is missing from the current working directory.",
    );
  }
  let packageJson: unknown;
  try {
    packageJson = JSON.parse(packageRaw);
  } catch {
    throw new Error(
      "Unable to locate the project root: package.json is not valid JSON.",
    );
  }
  if (
    typeof packageJson !== "object" ||
    packageJson === null ||
    typeof (packageJson as { name?: unknown }).name !== "string"
  ) {
    throw new Error(
      "Unable to locate the project root: package.json is missing a valid 'name' field.",
    );
  }
  if ((packageJson as { name: string }).name !== EXPECTED_PACKAGE_NAME) {
    throw new Error(
      `Unable to locate the project root: package.json 'name' must be "${EXPECTED_PACKAGE_NAME}".`,
    );
  }

  const registryDir = resolve(cwd, REGISTRY_DATA_DIR);
  let s;
  try {
    s = await stat(registryDir);
  } catch {
    throw new Error(
      "Unable to locate the project root: registry data directory is missing.",
    );
  }
  if (!s.isDirectory()) {
    throw new Error(
      "Unable to locate the project root: registry data directory is not a directory.",
    );
  }

  return cwd;
}

async function readJsonFile(fullPath: string, label: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(fullPath, "utf8");
  } catch {
    throw new Error(`Required file is missing or unreadable: ${label}.`);
  }
  // Strip exactly one leading BOM (U+FEFF) if present. JSON.parse does not
  // accept a leading BOM, but many editors and Windows tools emit UTF-8 files
  // with a BOM. Only the first character is stripped — BOM characters
  // elsewhere in the string are not touched and will still cause a parse
  // failure as intended.
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Required file is not valid JSON: ${label}.`);
  }
}

async function loadSchemas(): Promise<{
  toolContentSchema: object;
  articleFrontmatterSchema: object;
}> {
  let source;
  try {
    source = resolveContentRoot();
  } catch (err) {
    throw new Error((err as Error).message);
  }
  const toolPath = resolve(source.root, "schemas", "tool-content.schema.json");
  const articlePath = resolve(source.root, "schemas", "article-frontmatter.schema.json");
  const toolContentSchema = await readJsonFile(toolPath, "schemas/tool-content.schema.json");
  const articleFrontmatterSchema = await readJsonFile(articlePath, "schemas/article-frontmatter.schema.json");
  return {
    toolContentSchema: toolContentSchema as object,
    articleFrontmatterSchema: articleFrontmatterSchema as object,
  };
}

async function loadOnce(): Promise<PublicContentOutput> {
  const cwd = await assertWebsiteRoot();
  const toolsPath = resolve(cwd, REGISTRY_DATA_DIR, TOOLS_REGISTRY_FILE);
  const categoriesPath = resolve(cwd, REGISTRY_DATA_DIR, CATEGORIES_REGISTRY_FILE);

  const registryTools = await readJsonFile(toolsPath, "tools.json");
  const registryCategories = await readJsonFile(categoriesPath, "categories.json");

  const registryResult = validateRegistry(registryTools, registryCategories);
  if (!registryResult.ok) {
    throw new Error(
      `Registry validation failed:\n${registryResult.errors.join("\n")}`,
    );
  }

  const { toolContentSchema, articleFrontmatterSchema } = await loadSchemas();

  return buildSiteContent({
    registryTools,
    registryCategories,
    toolContentSchema,
    articleFrontmatterSchema,
  });
}

export async function getSiteContent(): Promise<PublicContentOutput> {
  const existing = getCachedPromise();
  if (existing) return existing;

  const promise = loadOnce();
  setCachedPromise(promise);
  promise.catch(() => {
    // Only clear if the cache still points to this promise — prevents clearing a newer load.
    if (getCachedPromise() === promise) {
      clearCachedPromise();
    }
  });
  return promise;
}

export async function getAllTools(): Promise<PublicToolWithContent[]> {
  return (await getSiteContent()).tools;
}

export async function getToolBySlug(
  slug: string,
): Promise<PublicToolWithContent | undefined> {
  return (await getSiteContent()).tools.find((t) => t.slug === slug);
}

export async function getAllCategories(): Promise<PublicCategory[]> {
  return (await getSiteContent()).categories;
}

export async function getCategoryBySlug(
  slug: string,
): Promise<PublicCategory | undefined> {
  return (await getSiteContent()).categories.find((c) => c.slug === slug);
}

export async function getAllArticles(): Promise<PublicArticle[]> {
  return (await getSiteContent()).articles;
}

export async function getArticleById(
  id: string,
): Promise<PublicArticle | undefined> {
  return (await getSiteContent()).articles.find((a) => a.id === id);
}