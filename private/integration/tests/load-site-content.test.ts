import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getSiteContent,
  getAllTools,
  getToolBySlug,
  getAllCategories,
  getCategoryBySlug,
  getAllArticles,
  getArticleById,
} from "../load-site-content";
import { resetSiteContentCacheForTests } from "../__test-only-cache-reset";

const toolSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "id", "title", "summary", "instructions", "examples", "faqs", "references"],
  properties: {
    schemaVersion: { const: 1 },
    id: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
    title: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1 },
    instructions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "step", "text"],
        properties: { id: { type: "string" }, step: { type: "integer", minimum: 1 }, text: { type: "string", minLength: 1 } },
      },
    },
    examples: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "input", "output"],
        properties: { id: { type: "string" }, title: { type: "string" }, input: { type: "string" }, output: { type: "string" } },
      },
    },
    faqs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question", "answer"],
        properties: { id: { type: "string" }, question: { type: "string" }, answer: { type: "string" } },
      },
    },
    references: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "url"],
        properties: { id: { type: "string" }, title: { type: "string" }, url: { type: "string", format: "uri" } },
      },
    },
  },
};

const articleSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "id", "title", "description", "status", "visibility"],
  properties: {
    schemaVersion: { const: 1 },
    id: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
    title: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    status: { enum: ["draft", "published", "archived"] },
    visibility: { enum: ["private", "public"] },
  },
};

function registryTool(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-tool",
    slug: "test-tool",
    name: "Test Tool",
    description: "Test",
    categoryId: "cat-1",
    status: "ready",
    visibility: "public",
    implementation: { module: "src/tools/test-tool/index.tsx", exportName: "TestTool" },
    contentId: "test-tool-content",
    tags: ["test"],
    metadata: { notes: "private note" },
    ...overrides,
  };
}

function registryCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: "cat-1",
    slug: "cat-1",
    name: "Category",
    description: "Cat",
    status: "ready",
    visibility: "public",
    metadata: { notes: "category notes" },
    ...overrides,
  };
}

function contentRecord(id: string) {
  return {
    schemaVersion: 1,
    id,
    title: "Content Title",
    summary: "Content Summary",
    instructions: [{ id: "i1", step: 1, text: "Do." }],
    examples: [{ id: "e1", title: "E", input: "a", output: "b" }],
    faqs: [{ id: "f1", question: "Q", answer: "A" }],
    references: [{ id: "r1", title: "R", url: "https://example.com" }],
  };
}

interface Fixture {
  websiteRoot: string;
  contentRoot: string;
  originalCwd: string;
  originalContentPath: string | undefined;
}

async function buildFixture(opts: {
  tools?: unknown[];
  categories?: unknown[];
  contents?: unknown[];
  articles?: { name: string; body: string }[];
  writeSchemas?: boolean;
  packageJson?: unknown | null;
  skipPackageJson?: boolean;
} = {}): Promise<Fixture> {
  const websiteRoot = await mkdtemp(join(tmpdir(), "site-"));

  if (!opts.skipPackageJson) {
    const pkg =
      opts.packageJson !== undefined
        ? opts.packageJson
        : { name: "tools-website" };
    const pkgText = typeof pkg === "string" ? pkg : JSON.stringify(pkg);
    await writeFile(join(websiteRoot, "package.json"), pkgText);
  }

  const registryData = join(websiteRoot, "private", "registry", "data");
  await mkdir(registryData, { recursive: true });
  await writeFile(join(registryData, "tools.json"), JSON.stringify(opts.tools ?? []));
  await writeFile(join(registryData, "categories.json"), JSON.stringify(opts.categories ?? []));

  const contentRoot = await mkdtemp(join(tmpdir(), "content-"));
  await mkdir(join(contentRoot, "tools"), { recursive: true });
  await mkdir(join(contentRoot, "articles"), { recursive: true });
  await mkdir(join(contentRoot, "schemas"), { recursive: true });
  if (opts.writeSchemas !== false) {
    await writeFile(join(contentRoot, "schemas", "tool-content.schema.json"), JSON.stringify(toolSchema));
    await writeFile(join(contentRoot, "schemas", "article-frontmatter.schema.json"), JSON.stringify(articleSchema));
  }
  for (const [i, c] of (opts.contents ?? []).entries()) {
    await writeFile(join(contentRoot, "tools", `c${i}.json`), JSON.stringify(c));
  }
  for (const a of opts.articles ?? []) {
    await writeFile(join(contentRoot, "articles", a.name), a.body);
  }

  return {
    websiteRoot,
    contentRoot,
    originalCwd: process.cwd(),
    originalContentPath: process.env.TOOLS_CONTENT_PATH,
  };
}

async function applyFixture(f: Fixture): Promise<void> {
  process.chdir(f.websiteRoot);
  process.env.TOOLS_CONTENT_PATH = f.contentRoot;
  resetSiteContentCacheForTests();
}

async function teardownFixture(f: Fixture): Promise<void> {
  process.chdir(f.originalCwd);
  if (f.originalContentPath === undefined) delete process.env.TOOLS_CONTENT_PATH;
  else process.env.TOOLS_CONTENT_PATH = f.originalContentPath;
  resetSiteContentCacheForTests();
  await rm(f.websiteRoot, { recursive: true, force: true });
  await rm(f.contentRoot, { recursive: true, force: true });
}

describe("load-site-content", () => {
  let fixture: Fixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await teardownFixture(fixture);
      fixture = null;
    }
  });

  it("loads successfully and returns public projection", async () => {
    fixture = await buildFixture({
      tools: [registryTool()],
      categories: [registryCategory()],
      contents: [contentRecord("test-tool-content")],
      articles: [{ name: "hello.md", body: "---\nschemaVersion: 1\nid: hello\ntitle: Hello\ndescription: Hi\nstatus: published\nvisibility: public\n---\nBody." }],
    });
    await applyFixture(fixture);
    const out = await getSiteContent();
    expect(out.tools).toHaveLength(1);
    expect(out.tools[0]?.slug).toBe("test-tool");
    expect(out.tools[0]?.content.title).toBe("Content Title");
    expect(out.categories).toHaveLength(1);
    expect(out.articles).toHaveLength(1);
    expect(out.articles[0]?.id).toBe("hello");
  });

  it("concurrent calls share a single load", async () => {
    fixture = await buildFixture({
      tools: [registryTool()],
      categories: [registryCategory()],
      contents: [contentRecord("test-tool-content")],
    });
    await applyFixture(fixture);
    const [a, b, c] = await Promise.all([getSiteContent(), getSiteContent(), getSiteContent()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("looks up tool by slug", async () => {
    fixture = await buildFixture({
      tools: [registryTool()],
      categories: [registryCategory()],
      contents: [contentRecord("test-tool-content")],
    });
    await applyFixture(fixture);
    const t = await getToolBySlug("test-tool");
    expect(t?.id).toBe("test-tool");
    expect(await getToolBySlug("nonexistent")).toBeUndefined();
  });

  it("looks up category by slug", async () => {
    fixture = await buildFixture({
      tools: [registryTool()],
      categories: [registryCategory()],
      contents: [contentRecord("test-tool-content")],
    });
    await applyFixture(fixture);
    const c = await getCategoryBySlug("cat-1");
    expect(c?.id).toBe("cat-1");
    expect(await getCategoryBySlug("nope")).toBeUndefined();
  });

  it("looks up article by ID", async () => {
    fixture = await buildFixture({
      tools: [registryTool()],
      categories: [registryCategory()],
      contents: [contentRecord("test-tool-content")],
      articles: [{ name: "hello.md", body: "---\nschemaVersion: 1\nid: hello\ntitle: H\ndescription: D\nstatus: published\nvisibility: public\n---\nBody." }],
    });
    await applyFixture(fixture);
    const a = await getArticleById("hello");
    expect(a?.id).toBe("hello");
    expect(await getArticleById("missing")).toBeUndefined();
  });

  it("returns empty lists when no records", async () => {
    fixture = await buildFixture({ tools: [], categories: [], contents: [] });
    await applyFixture(fixture);
    expect(await getAllTools()).toEqual([]);
    expect(await getAllCategories()).toEqual([]);
    expect(await getAllArticles()).toEqual([]);
  });

  it("fails when TOOLS_CONTENT_PATH is missing", async () => {
    fixture = await buildFixture({ tools: [], categories: [] });
    process.chdir(fixture.websiteRoot);
    delete process.env.TOOLS_CONTENT_PATH;
    resetSiteContentCacheForTests();
    await expect(getSiteContent()).rejects.toThrow(/TOOLS_CONTENT_PATH/);
  });

  it("fails when registry tools.json is missing", async () => {
    fixture = await buildFixture({ tools: [], categories: [] });
    await rm(join(fixture.websiteRoot, "private", "registry", "data", "tools.json"));
    await applyFixture(fixture);
    await expect(getSiteContent()).rejects.toThrow(/tools\.json/);
  });

  it("fails when content schemas are missing", async () => {
    fixture = await buildFixture({ tools: [registryTool()], categories: [registryCategory()], contents: [contentRecord("test-tool-content")], writeSchemas: false });
    await applyFixture(fixture);
    await expect(getSiteContent()).rejects.toThrow(/tool-content\.schema\.json/);
  });

  it("fails on invalid registry data", async () => {
    fixture = await buildFixture({
      tools: [{ ...registryTool(), status: "bogus" }],
      categories: [registryCategory()],
      contents: [],
    });
    await applyFixture(fixture);
    await expect(getSiteContent()).rejects.toThrow(/Registry validation failed/);
  });

  it("does not expose private fields", async () => {
    fixture = await buildFixture({
      tools: [registryTool()],
      categories: [registryCategory()],
      contents: [contentRecord("test-tool-content")],
    });
    await applyFixture(fixture);
    const out = await getSiteContent();
    const t = out.tools[0];
    if (!t) throw new Error("Expected tool");
    const rec = t as unknown as Record<string, unknown>;
    expect(rec).not.toHaveProperty("contentId");
    expect(rec).not.toHaveProperty("metadata");
    expect(rec).not.toHaveProperty("implementation");
    const json = JSON.stringify(out);
    expect(json).not.toContain("private note");
    expect(json).not.toContain("category notes");
    expect(json).not.toContain("test-tool-content");
  });

  // ─── Website root validation tests ─────────────────────────────────
  it("fails when run from a directory without package.json", async () => {
    fixture = await buildFixture({ tools: [], categories: [], skipPackageJson: true });
    await applyFixture(fixture);
    await expect(getSiteContent()).rejects.toThrow(/package\.json is missing/);
  });

  it("fails when package.json is malformed", async () => {
    fixture = await buildFixture({
      tools: [],
      categories: [],
      packageJson: "{ not valid json",
    });
    await applyFixture(fixture);
    await expect(getSiteContent()).rejects.toThrow(/not valid JSON/);
  });

  it("fails when package.json has wrong name", async () => {
    fixture = await buildFixture({
      tools: [],
      categories: [],
      packageJson: { name: "some-other-project" },
    });
    await applyFixture(fixture);
    await expect(getSiteContent()).rejects.toThrow(/name.*must be "tools-website"/);
  });

  it("fails when package.json has no name field", async () => {
    fixture = await buildFixture({
      tools: [],
      categories: [],
      packageJson: { version: "1.0.0" },
    });
    await applyFixture(fixture);
    await expect(getSiteContent()).rejects.toThrow(/name/);
  });

  it("fails when run from unrelated directory with coincidentally-named registry folder", async () => {
    fixture = await buildFixture({
      tools: [],
      categories: [],
      packageJson: { name: "unrelated-project" },
    });
    await applyFixture(fixture);
    await expect(getSiteContent()).rejects.toThrow(/name.*must be "tools-website"/);
  });

  // ─── BOM handling in registry JSON ─────────────────────────────────
  it("parses BOM-prefixed valid JSON in registry files", async () => {
    fixture = await buildFixture({ tools: [], categories: [] });
    const bom = "\uFEFF";
    await writeFile(
      join(fixture.websiteRoot, "private", "registry", "data", "tools.json"),
      bom + "[]",
      "utf8",
    );
    await writeFile(
      join(fixture.websiteRoot, "private", "registry", "data", "categories.json"),
      bom + "[]",
      "utf8",
    );
    await applyFixture(fixture);
    const out = await getSiteContent();
    expect(out.tools).toEqual([]);
    expect(out.categories).toEqual([]);
  });

  it("continues to parse BOM-free valid JSON", async () => {
    fixture = await buildFixture({ tools: [], categories: [] });
    await applyFixture(fixture);
    const out = await getSiteContent();
    expect(out.tools).toEqual([]);
    expect(out.categories).toEqual([]);
  });

  it("still fails on invalid JSON even without BOM", async () => {
    fixture = await buildFixture({ tools: [], categories: [] });
    await writeFile(
      join(fixture.websiteRoot, "private", "registry", "data", "tools.json"),
      "{ not valid",
      "utf8",
    );
    await applyFixture(fixture);
    await expect(getSiteContent()).rejects.toThrow(/not valid JSON/);
  });

  it("does not strip a BOM that appears after the first character", async () => {
    fixture = await buildFixture({ tools: [], categories: [] });
    await writeFile(
      join(fixture.websiteRoot, "private", "registry", "data", "tools.json"),
      "[1,\uFEFF2]",
      "utf8",
    );
    await applyFixture(fixture);
    await expect(getSiteContent()).rejects.toThrow(/not valid JSON/);
  });
});