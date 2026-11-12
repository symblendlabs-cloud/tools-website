import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";
import {
  validateRegistry,
  projectPublic,
  type ToolRecord,
  type CategoryRecord,
  type PublicTool,
  type PublicCategory,
} from "../registry";
import {
  assertRequiredSource,
  loadArticleFiles,
  loadToolContentFiles,
  resolveContentRoot,
  assertContentRootAvailable,
  type ContentSource,
} from "./load-content";
import { renderMarkdownToSafeHtml } from "./render-markdown";
import type {
  PublicContentOutput,
  PublicToolWithContent,
  PublicArticle,
  PublicToolContent,
  PublicInstruction,
  PublicExample,
  PublicFaq,
  PublicReference,
} from "./public-types";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

export interface ValidatedToolContent {
  relativePath: string;
  contentId: string;
  data: unknown;
}

export interface ValidatedArticle {
  relativePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface ContentValidationResult {
  toolContent: Map<string, ValidatedToolContent>;
  articles: ValidatedArticle[];
}

function formatErrors(
  errors: { instancePath?: string; message?: string }[] | null | undefined,
): string {
  return (errors || [])
    .map((e) => `  ${e.instancePath || "/"} ${e.message}`)
    .join("\n");
}

function extractFrontmatter(
  raw: string,
  relPath: string,
): { frontmatter: unknown; body: string } {
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== "---") {
    throw new Error(`${relPath}: missing opening frontmatter delimiter.`);
  }
  const closingIndex = lines.indexOf("---", 1);
  if (closingIndex === -1) {
    throw new Error(`${relPath}: missing closing frontmatter delimiter.`);
  }
  const frontmatterRaw = lines.slice(1, closingIndex).join("\n");
  const body = lines.slice(closingIndex + 1).join("\n");
  if (body.trim().length === 0) {
    throw new Error(`${relPath}: article body is empty.`);
  }
  let parsed;
  try {
    parsed = YAML.parse(frontmatterRaw);
  } catch {
    throw new Error(`${relPath}: malformed YAML frontmatter.`);
  }
  return { frontmatter: parsed, body };
}

const NESTED_COLLECTIONS = ["instructions", "examples", "faqs", "references"] as const;

function checkNestedIdUniqueness(data: unknown, relPath: string): void {
  if (typeof data !== "object" || data === null) return;
  const record = data as Record<string, unknown>;
  for (const collection of NESTED_COLLECTIONS) {
    const items = record[collection];
    if (!Array.isArray(items)) continue;
    const seen = new Set<string>();
    for (const item of items) {
      if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
        const id = (item as { id: string }).id;
        if (seen.has(id)) {
          throw new Error(
            `${relPath}: duplicate id "${id}" within collection "${collection}".`,
          );
        }
        seen.add(id);
      }
    }
  }
}

export interface ValidateContentOptions {
  registryTools: unknown;
  registryCategories: unknown;
  toolContentSchema: object;
  articleFrontmatterSchema: object;
}

export async function validateContent(
  source: ContentSource,
  options: ValidateContentOptions,
): Promise<ContentValidationResult> {
  await assertContentRootAvailable(source);
  await assertRequiredSource(source, "tools", "directory");
  await assertRequiredSource(source, "articles", "directory");
  await assertRequiredSource(source, "schemas/tool-content.schema.json", "file");
  await assertRequiredSource(source, "schemas/article-frontmatter.schema.json", "file");

  const registryResult = validateRegistry(
    options.registryTools,
    options.registryCategories,
  );
  if (!registryResult.ok) {
    throw new Error(
      `Registry validation failed:\n${registryResult.errors.join("\n")}`,
    );
  }
  const tools = options.registryTools as ToolRecord[];
  const categories = options.registryCategories as CategoryRecord[];

  const toolValidator = ajv.compile(options.toolContentSchema);
  const articleValidator = ajv.compile(options.articleFrontmatterSchema);

  const loadedTools = await loadToolContentFiles(source);
  const toolContentById = new Map<string, ValidatedToolContent>();
  const duplicateIds: string[] = [];

  for (const loaded of loadedTools) {
    const valid = toolValidator(loaded.data);
    if (!valid) {
      throw new Error(
        `${loaded.relativePath}: tool content schema validation failed\n${formatErrors(toolValidator.errors)}`,
      );
    }
    const data = loaded.data as { id: string };
    checkNestedIdUniqueness(loaded.data, loaded.relativePath);
    if (toolContentById.has(data.id)) {
      duplicateIds.push(data.id);
    } else {
      toolContentById.set(data.id, {
        relativePath: loaded.relativePath,
        contentId: data.id,
        data: loaded.data,
      });
    }
  }

  if (duplicateIds.length > 0) {
    throw new Error(
      `Duplicate content IDs found: ${duplicateIds.join(", ")}.`,
    );
  }

  const knownContentIds = new Set(tools.map((t) => t.contentId));
  const orphans: string[] = [];
  for (const [contentId, record] of toolContentById) {
    if (!knownContentIds.has(contentId)) {
      orphans.push(`${contentId} (${record.relativePath})`);
    }
  }
  if (orphans.length > 0) {
    throw new Error(
      `Orphan content records (no matching registry tool.contentId): ${orphans.join(", ")}.`,
    );
  }

  const projection = projectPublic(tools, categories);
  const missingContent: string[] = [];
  for (const publicTool of projection.tools) {
    const registryTool = tools.find((t) => t.id === publicTool.id);
    if (!registryTool) continue;
    if (!toolContentById.has(registryTool.contentId)) {
      missingContent.push(registryTool.id);
    }
  }
  if (missingContent.length > 0) {
    throw new Error(
      `Eligible public tools missing content: ${missingContent.join(", ")}.`,
    );
  }

  const loadedArticles = await loadArticleFiles(source);
  const validatedArticles: ValidatedArticle[] = [];
  for (const loaded of loadedArticles) {
    const { frontmatter, body } = extractFrontmatter(loaded.raw, loaded.relativePath);
    const valid = articleValidator(frontmatter);
    if (!valid) {
      throw new Error(
        `${loaded.relativePath}: article frontmatter validation failed\n${formatErrors(articleValidator.errors)}`,
      );
    }
    validatedArticles.push({
      relativePath: loaded.relativePath,
      frontmatter: frontmatter as Record<string, unknown>,
      body,
    });
  }

  return {
    toolContent: toolContentById,
    articles: validatedArticles,
  };
}

export interface PublicArticleCandidate {
  id: string;
  title: string;
  description: string;
  body: string;
}

export function selectPublicArticles(
  articles: ValidatedArticle[],
): PublicArticleCandidate[] {
  const result: PublicArticleCandidate[] = [];
  for (const article of articles) {
    const fm = article.frontmatter;
    if (fm.status !== "published" || fm.visibility !== "public") continue;
    result.push({
      id: fm.id as string,
      title: fm.title as string,
      description: fm.description as string,
      body: article.body,
    });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// Public tool content extraction
// ─────────────────────────────────────────────────────────────

interface RawInstruction {
  id: string;
  step: number;
  text: string;
}

interface RawExample {
  id: string;
  title: string;
  input: string;
  output: string;
}

interface RawFaq {
  id: string;
  question: string;
  answer: string;
}

interface RawReference {
  id: string;
  title: string;
  url: string;
}

interface RawToolContent {
  title: string;
  summary: string;
  instructions: RawInstruction[];
  examples: RawExample[];
  faqs: RawFaq[];
  references: RawReference[];
}

// Re-export the canonical content types for convenience.
export type {
  PublicInstruction,
  PublicExample,
  PublicFaq,
  PublicReference,
  PublicToolContent,
  PublicToolWithContent,
  PublicArticle,
  PublicContentOutput,
};

function toPublicToolContent(data: unknown): PublicToolContent {
  const raw = data as RawToolContent;
  const instructions: PublicInstruction[] = raw.instructions.map((i) => ({
    id: i.id,
    step: i.step,
    text: i.text,
  }));
  const examples: PublicExample[] = raw.examples.map((e) => ({
    id: e.id,
    title: e.title,
    input: e.input,
    output: e.output,
  }));
  const faqs: PublicFaq[] = raw.faqs.map((f) => ({
    id: f.id,
    question: f.question,
    answer: f.answer,
  }));
  const references: PublicReference[] = raw.references.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
  }));
  return {
    title: raw.title,
    summary: raw.summary,
    instructions,
    examples,
    faqs,
    references,
  };
}

export interface BuildPublicOutputArgs {
  source: ContentSource;
  registryTools: unknown;
  registryCategories: unknown;
  toolContentSchema: object;
  articleFrontmatterSchema: object;
}

export async function buildPublicOutput(
  args: BuildPublicOutputArgs,
  renderArticle: (markdown: string) => Promise<string>,
): Promise<PublicContentOutput> {
  const validation = await validateContent(args.source, {
    registryTools: args.registryTools,
    registryCategories: args.registryCategories,
    toolContentSchema: args.toolContentSchema,
    articleFrontmatterSchema: args.articleFrontmatterSchema,
  });

  const tools = args.registryTools as ToolRecord[];
  const categories = args.registryCategories as CategoryRecord[];
  const projection = projectPublic(tools, categories);

  const publicTools: PublicToolWithContent[] = [];
  for (const pub of projection.tools) {
    const registryTool = tools.find((t) => t.id === pub.id);
    if (!registryTool) continue;
    const content = validation.toolContent.get(registryTool.contentId);
    if (!content) {
      throw new Error(`Content missing for public tool "${registryTool.id}".`);
    }
    publicTools.push({
      ...pub,
      content: toPublicToolContent(content.data),
    });
  }

  const publicArticles: PublicArticle[] = await Promise.all(
    selectPublicArticles(validation.articles).map(async (a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      body: await renderArticle(a.body),
    })),
  );

  return {
    tools: publicTools,
    categories: projection.categories,
    articles: publicArticles,
  };
}

// ─────────────────────────────────────────────────────────────
// Production-facing entry point
// ─────────────────────────────────────────────────────────────

export interface BuildSiteContentArgs {
  registryTools: unknown;
  registryCategories: unknown;
  toolContentSchema: object;
  articleFrontmatterSchema: object;
}

/**
 * Production-facing content loader.
 *
 * - Reads TOOLS_CONTENT_PATH from the environment.
 * - Uses the approved Markdown renderer (`renderMarkdownToSafeHtml`).
 * - Returns the canonical `PublicContentOutput` shape.
 *
 * This function is intended for build-time/server-only use. It uses
 * Node.js filesystem APIs and must not be imported into browser code.
 */
export async function buildSiteContent(
  args: BuildSiteContentArgs,
): Promise<PublicContentOutput> {
  const source = resolveContentRoot();
  return buildPublicOutput(
    {
      source,
      registryTools: args.registryTools,
      registryCategories: args.registryCategories,
      toolContentSchema: args.toolContentSchema,
      articleFrontmatterSchema: args.articleFrontmatterSchema,
    },
    renderMarkdownToSafeHtml,
  );
}