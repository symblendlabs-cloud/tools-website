import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateContent,
  selectPublicArticles,
  buildPublicOutput,
  buildSiteContent,
} from "../validate-content";

async function canSymlink(): Promise<boolean> {
  const probeRoot = await mkdtemp(join(tmpdir(), "symlink-probe-"));
  try {
    await writeFile(join(probeRoot, "t"), "x");
    try {
      await symlink(join(probeRoot, "t"), join(probeRoot, "l"));
      return true;
    } catch {
      return false;
    }
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

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

function baseRegistryTool(overrides: Record<string, unknown> = {}) {
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

function baseRegistryCategory() {
  return {
    id: "cat-1",
    slug: "cat-1",
    name: "Category",
    description: "Cat",
    status: "ready",
    visibility: "public",
    metadata: { notes: "category notes" },
  };
}

function baseContent(id: string) {
  return {
    schemaVersion: 1,
    id,
    title: "Content Title",
    summary: "Content Summary",
    instructions: [{ id: "i1", step: 1, text: "Do something." }],
    examples: [{ id: "e1", title: "Example One", input: "a", output: "b" }],
    faqs: [{ id: "f1", question: "Q?", answer: "A." }],
    references: [{ id: "r1", title: "Ref", url: "https://example.com" }],
  };
}

async function setupRoot(): Promise<string> {
  const tmp = await mkdtemp(join(tmpdir(), "content-"));
  await mkdir(join(tmp, "tools"), { recursive: true });
  await mkdir(join(tmp, "articles"), { recursive: true });
  await mkdir(join(tmp, "schemas"), { recursive: true });
  await writeFile(join(tmp, "schemas", "tool-content.schema.json"), JSON.stringify(toolSchema));
  await writeFile(join(tmp, "schemas", "article-frontmatter.schema.json"), JSON.stringify(articleSchema));
  return tmp;
}

describe("validateContent", () => {
  let tmp: string;

  beforeEach(async () => { tmp = await setupRoot(); });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

  it("succeeds on valid tool content", async () => {
    await writeFile(join(tmp, "tools", "a.json"), JSON.stringify(baseContent("test-tool-content")));
    const result = await validateContent(
      { root: tmp },
      { registryTools: [baseRegistryTool()], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
    );
    expect(result.toolContent.size).toBe(1);
  });

  it("fails when eligible public tool has no content", async () => {
    await expect(validateContent(
      { root: tmp },
      { registryTools: [baseRegistryTool()], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
    )).rejects.toThrow(/missing content/);
  });

  it("rejects duplicate content IDs", async () => {
    await writeFile(join(tmp, "tools", "a.json"), JSON.stringify(baseContent("test-tool-content")));
    await writeFile(join(tmp, "tools", "b.json"), JSON.stringify(baseContent("test-tool-content")));
    await expect(validateContent(
      { root: tmp },
      { registryTools: [baseRegistryTool()], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
    )).rejects.toThrow(/Duplicate content IDs/);
  });

  it("rejects orphan content", async () => {
    await writeFile(join(tmp, "tools", "a.json"), JSON.stringify(baseContent("orphan")));
    await expect(validateContent(
      { root: tmp },
      { registryTools: [baseRegistryTool()], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
    )).rejects.toThrow(/Orphan/);
  });

  it("rejects duplicate nested instruction IDs", async () => {
    const content = baseContent("test-tool-content");
    content.instructions = [
      { id: "dup", step: 1, text: "One." },
      { id: "dup", step: 2, text: "Two." },
    ];
    await writeFile(join(tmp, "tools", "a.json"), JSON.stringify(content));
    await expect(validateContent(
      { root: tmp },
      { registryTools: [baseRegistryTool()], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
    )).rejects.toThrow(/duplicate id/);
  });

  it("permits same nested ID across collections", async () => {
    const content = baseContent("test-tool-content");
    content.instructions = [{ id: "shared", step: 1, text: "Do." }];
    content.examples = [{ id: "shared", title: "E", input: "a", output: "b" }];
    await writeFile(join(tmp, "tools", "a.json"), JSON.stringify(content));
    const result = await validateContent(
      { root: tmp },
      { registryTools: [baseRegistryTool()], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
    );
    expect(result.toolContent.size).toBe(1);
  });

  it("fails when tools/ missing", async () => {
    await rm(join(tmp, "tools"), { recursive: true });
    await expect(validateContent(
      { root: tmp },
      { registryTools: [baseRegistryTool()], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
    )).rejects.toThrow(/Required content source is missing: "tools"/);
  });

  it("fails when articles/ missing", async () => {
    await rm(join(tmp, "articles"), { recursive: true });
    await expect(validateContent(
      { root: tmp },
      { registryTools: [baseRegistryTool()], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
    )).rejects.toThrow(/Required content source is missing: "articles"/);
  });

  it("fails when schema missing", async () => {
    await rm(join(tmp, "schemas", "tool-content.schema.json"));
    await expect(validateContent(
      { root: tmp },
      { registryTools: [baseRegistryTool()], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
    )).rejects.toThrow(/Required content source is missing/);
  });

  it("rejects symlinked tools directory", async () => {
    if (!(await canSymlink())) return;
    const external = await mkdtemp(join(tmpdir(), "ext-"));
    try {
      await rm(join(tmp, "tools"), { recursive: true });
      await mkdir(join(external, "realtools"));
      await symlink(join(external, "realtools"), join(tmp, "tools"));
      await expect(validateContent(
        { root: tmp },
        { registryTools: [baseRegistryTool()], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
      )).rejects.toThrow(/Symlinked/);
    } finally {
      await rm(external, { recursive: true, force: true });
    }
  });

  it("rejects symlinked schema file", async () => {
    if (!(await canSymlink())) return;
    const external = await mkdtemp(join(tmpdir(), "ext-"));
    try {
      await writeFile(join(external, "s.json"), "{}");
      await rm(join(tmp, "schemas", "tool-content.schema.json"));
      await symlink(join(external, "s.json"), join(tmp, "schemas", "tool-content.schema.json"));
      await expect(validateContent(
        { root: tmp },
        { registryTools: [baseRegistryTool()], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
      )).rejects.toThrow(/Symlinked/);
    } finally {
      await rm(external, { recursive: true, force: true });
    }
  });

  it("does not leak absolute content-root path in errors", async () => {
    await rm(join(tmp, "tools"), { recursive: true });
    try {
      await validateContent(
        { root: tmp },
        { registryTools: [baseRegistryTool()], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
      );
      throw new Error("Expected rejection");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).not.toContain(tmp);
      expect(msg).not.toMatch(/[A-Z]:\\/);
    }
  });
});

describe("selectPublicArticles", () => {
  it("includes only published + public", () => {
    const articles = [
      { relativePath: "a.md", frontmatter: { id: "a", title: "A", description: "D", status: "published", visibility: "public" }, body: "B" },
      { relativePath: "b.md", frontmatter: { id: "b", title: "B", description: "D", status: "draft", visibility: "public" }, body: "B" },
      { relativePath: "c.md", frontmatter: { id: "c", title: "C", description: "D", status: "published", visibility: "private" }, body: "B" },
    ];
    const result = selectPublicArticles(articles as never);
    expect(result).toHaveLength(1);
    const first = result[0];
    if (!first) throw new Error("Expected first public article");
    expect(first.id).toBe("a");
  });
});

describe("buildPublicOutput", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await setupRoot(); });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

  it("produces complete output with content and articles", async () => {
    await writeFile(join(tmp, "tools", "a.json"), JSON.stringify(baseContent("test-tool-content")));
    await writeFile(join(tmp, "articles", "hello.md"),
      "---\nschemaVersion: 1\nid: hello\ntitle: Hello\ndescription: Hi\nstatus: published\nvisibility: public\n---\nBody text.");
    const output = await buildPublicOutput(
      { source: { root: tmp }, registryTools: [baseRegistryTool()], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
      async (md) => `<p>${md.trim()}</p>`,
    );
    expect(output.tools).toHaveLength(1);
    const t = output.tools[0];
    if (!t) throw new Error("Expected tool");
    expect(t.content.title).toBe("Content Title");
    expect(t.content.instructions[0]?.step).toBe(1);
    expect(t.content.instructions[0]?.text).toBe("Do something.");
    expect(output.articles).toHaveLength(1);
    expect(output.articles[0]?.body).toBe("<p>Body text.</p>");
  });

  it("instruction has no title/body; example has no description", async () => {
    await writeFile(join(tmp, "tools", "a.json"), JSON.stringify(baseContent("test-tool-content")));
    const output = await buildPublicOutput(
      { source: { root: tmp }, registryTools: [baseRegistryTool()], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
      async () => "",
    );
    const t = output.tools[0];
    if (!t) throw new Error("Expected tool");
    const instr = t.content.instructions[0];
    if (!instr) throw new Error("Expected instruction");
    expect(instr).not.toHaveProperty("title");
    expect(instr).not.toHaveProperty("body");
    const ex = t.content.examples[0];
    if (!ex) throw new Error("Expected example");
    expect(ex).not.toHaveProperty("description");
  });

  it("excludes private metadata, contentId, implementation", async () => {
    await writeFile(join(tmp, "tools", "a.json"), JSON.stringify(baseContent("test-tool-content")));
    const output = await buildPublicOutput(
      { source: { root: tmp }, registryTools: [baseRegistryTool()], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
      async () => "",
    );
    const t = output.tools[0];
    if (!t) throw new Error("Expected tool");
    const rec = t as unknown as Record<string, unknown>;
    expect(rec).not.toHaveProperty("contentId");
    expect(rec).not.toHaveProperty("metadata");
    expect(rec).not.toHaveProperty("implementation");
    const json = JSON.stringify(output);
    expect(json).not.toContain("private note");
    expect(json).not.toContain("test-tool-content");
  });

  it("different tool ID and content ID associate correctly", async () => {
    const tool = baseRegistryTool({ id: "reg-id", slug: "reg-slug", contentId: "content-id" });
    await writeFile(join(tmp, "tools", "a.json"), JSON.stringify(baseContent("content-id")));
    const output = await buildPublicOutput(
      { source: { root: tmp }, registryTools: [tool], registryCategories: [baseRegistryCategory()], toolContentSchema: toolSchema, articleFrontmatterSchema: articleSchema },
      async () => "",
    );
    expect(output.tools[0]?.id).toBe("reg-id");
    expect(output.tools[0]?.content.instructions[0]?.text).toBe("Do something.");
  });
});

describe("buildSiteContent", () => {
  it("uses renderMarkdownToSafeHtml for article bodies", async () => {
    const tmp = await setupRoot();
    const original = process.env.TOOLS_CONTENT_PATH;
    try {
      process.env.TOOLS_CONTENT_PATH = tmp;
      await writeFile(join(tmp, "tools", "a.json"), JSON.stringify(baseContent("test-tool-content")));
      await writeFile(join(tmp, "articles", "hello.md"),
        "---\nschemaVersion: 1\nid: hello\ntitle: Hello\ndescription: Hi\nstatus: published\nvisibility: public\n---\n# Heading\n\nBody.");
      const output = await buildSiteContent({
        registryTools: [baseRegistryTool()],
        registryCategories: [baseRegistryCategory()],
        toolContentSchema: toolSchema,
        articleFrontmatterSchema: articleSchema,
      });
      expect(output.articles).toHaveLength(1);
      const article = output.articles[0];
      if (!article) throw new Error("Expected article");
      expect(article.body).toContain("<h1>Heading</h1>");
      expect(article.body).toContain("<p>Body.</p>");
    } finally {
      if (original === undefined) delete process.env.TOOLS_CONTENT_PATH;
      else process.env.TOOLS_CONTENT_PATH = original;
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("uses absolute path from TOOLS_CONTENT_PATH", async () => {
    const tmp = await setupRoot();
    const original = process.env.TOOLS_CONTENT_PATH;
    try {
      process.env.TOOLS_CONTENT_PATH = tmp;
      await writeFile(join(tmp, "tools", "a.json"), JSON.stringify(baseContent("test-tool-content")));
      await expect(
        buildSiteContent({
          registryTools: [baseRegistryTool()],
          registryCategories: [baseRegistryCategory()],
          toolContentSchema: toolSchema,
          articleFrontmatterSchema: articleSchema,
        }),
      ).resolves.toBeDefined();
    } finally {
      if (original === undefined) delete process.env.TOOLS_CONTENT_PATH;
      else process.env.TOOLS_CONTENT_PATH = original;
      await rm(tmp, { recursive: true, force: true });
    }
  });
});