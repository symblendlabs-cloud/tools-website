import type { CategoryRecord } from "../schema/category.schema";
import type { ToolRecord } from "../schema/tool.schema";
import { TOOL_STATUSES, VISIBILITIES } from "../schema/tool.schema";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXPORT_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const IMPLEMENTATION_PATH_PREFIX = "src/tools/";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidId(value: unknown): value is string {
  return isNonEmptyString(value) && ID_PATTERN.test(value);
}

function isValidSlug(value: unknown): value is string {
  return isNonEmptyString(value) && SLUG_PATTERN.test(value);
}

function isValidStatus(value: unknown): boolean {
  return typeof value === "string" && (TOOL_STATUSES as readonly string[]).includes(value);
}

function isValidVisibility(value: unknown): boolean {
  return typeof value === "string" && (VISIBILITIES as readonly string[]).includes(value);
}

function isValidImplementationModule(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  if (!value.startsWith(IMPLEMENTATION_PATH_PREFIX)) return false;
  if (value.includes("\\")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(value)) return false;
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return false;
  }
  return true;
}

function isValidExportName(value: unknown): value is string {
  return isNonEmptyString(value) && EXPORT_NAME_PATTERN.test(value);
}

function isValidTags(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  for (const tag of value) {
    if (typeof tag !== "string") return false;
    if (tag.length === 0) return false;
    if (!SLUG_PATTERN.test(tag)) return false;
  }
  return true;
}

function validateCategoryRecord(
  record: unknown,
  index: number,
  errors: string[],
): record is CategoryRecord {
  if (typeof record !== "object" || record === null) {
    errors.push(`categories[${index}]: not an object`);
    return false;
  }
  const c = record as Record<string, unknown>;
  let ok = true;

  if (!isValidId(c.id)) {
    errors.push(`categories[${index}].id: invalid identifier`);
    ok = false;
  }
  if (!isValidSlug(c.slug)) {
    errors.push(`categories[${index}].slug: invalid slug`);
    ok = false;
  }
  if (!isNonEmptyString(c.name)) {
    errors.push(`categories[${index}].name: missing or empty`);
    ok = false;
  }
  if (!isNonEmptyString(c.description)) {
    errors.push(`categories[${index}].description: missing or empty`);
    ok = false;
  }
  if (!isValidStatus(c.status)) {
    errors.push(`categories[${index}].status: invalid value`);
    ok = false;
  }
  if (!isValidVisibility(c.visibility)) {
    errors.push(`categories[${index}].visibility: invalid value`);
    ok = false;
  }
  if (typeof c.metadata !== "object" || c.metadata === null) {
    errors.push(`categories[${index}].metadata: missing`);
    ok = false;
  } else {
    const md = c.metadata as Record<string, unknown>;
    if (typeof md.notes !== "string") {
      errors.push(`categories[${index}].metadata.notes: missing or not a string`);
      ok = false;
    }
  }

  return ok;
}

function validateToolRecord(
  record: unknown,
  index: number,
  categoryIds: Set<string>,
  errors: string[],
): record is ToolRecord {
  if (typeof record !== "object" || record === null) {
    errors.push(`tools[${index}]: not an object`);
    return false;
  }
  const t = record as Record<string, unknown>;
  let ok = true;

  if (!isValidId(t.id)) {
    errors.push(`tools[${index}].id: invalid identifier`);
    ok = false;
  }
  if (!isValidSlug(t.slug)) {
    errors.push(`tools[${index}].slug: invalid slug`);
    ok = false;
  }
  if (!isNonEmptyString(t.name)) {
    errors.push(`tools[${index}].name: missing or empty`);
    ok = false;
  }
  if (!isNonEmptyString(t.description)) {
    errors.push(`tools[${index}].description: missing or empty`);
    ok = false;
  }
  if (!isValidId(t.categoryId)) {
    errors.push(`tools[${index}].categoryId: invalid identifier`);
    ok = false;
  } else if (!categoryIds.has(t.categoryId as string)) {
    errors.push(`tools[${index}].categoryId: references nonexistent category "${t.categoryId}"`);
    ok = false;
  }
  if (!isValidStatus(t.status)) {
    errors.push(`tools[${index}].status: invalid value`);
    ok = false;
  }
  if (!isValidVisibility(t.visibility)) {
    errors.push(`tools[${index}].visibility: invalid value`);
    ok = false;
  }
  if (typeof t.implementation !== "object" || t.implementation === null) {
    errors.push(`tools[${index}].implementation: missing`);
    ok = false;
  } else {
    const impl = t.implementation as Record<string, unknown>;
    if (!isValidImplementationModule(impl.module)) {
      errors.push(`tools[${index}].implementation.module: invalid path`);
      ok = false;
    }
    if (!isValidExportName(impl.exportName)) {
      errors.push(`tools[${index}].implementation.exportName: invalid export name`);
      ok = false;
    }
  }
  if (!isNonEmptyString(t.contentId)) {
    errors.push(`tools[${index}].contentId: missing or empty`);
    ok = false;
  }
  if (!isValidTags(t.tags)) {
    errors.push(`tools[${index}].tags: malformed`);
    ok = false;
  }
  if (typeof t.metadata !== "object" || t.metadata === null) {
    errors.push(`tools[${index}].metadata: missing`);
    ok = false;
  } else {
    const md = t.metadata as Record<string, unknown>;
    if (typeof md.notes !== "string") {
      errors.push(`tools[${index}].metadata.notes: missing or not a string`);
      ok = false;
    }
  }

  return ok;
}

export function validateRegistry(tools: unknown, categories: unknown): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(categories)) {
    errors.push("categories: not an array");
    return { ok: false, errors };
  }
  if (!Array.isArray(tools)) {
    errors.push("tools: not an array");
    return { ok: false, errors };
  }

  const categoryIds = new Set<string>();
  const categorySlugs = new Set<string>();

  categories.forEach((record, index) => {
    const valid = validateCategoryRecord(record, index, errors);
    if (!valid) return;
    const c = record as CategoryRecord;
    if (categoryIds.has(c.id)) {
      errors.push(`categories[${index}].id: duplicate "${c.id}"`);
    } else {
      categoryIds.add(c.id);
    }
    if (categorySlugs.has(c.slug)) {
      errors.push(`categories[${index}].slug: duplicate "${c.slug}"`);
    } else {
      categorySlugs.add(c.slug);
    }
  });

  const toolIds = new Set<string>();
  const toolSlugs = new Set<string>();

  tools.forEach((record, index) => {
    const valid = validateToolRecord(record, index, categoryIds, errors);
    if (!valid) return;
    const t = record as ToolRecord;
    if (toolIds.has(t.id)) {
      errors.push(`tools[${index}].id: duplicate "${t.id}"`);
    } else {
      toolIds.add(t.id);
    }
    if (toolSlugs.has(t.slug)) {
      errors.push(`tools[${index}].slug: duplicate "${t.slug}"`);
    } else {
      toolSlugs.add(t.slug);
    }
  });

  return { ok: errors.length === 0, errors };
}

export interface PublicTool {
  id: string;
  slug: string;
  name: string;
  description: string;
  categoryId: string;
  tags: string[];
}

export interface PublicCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
}

function isEligibleTool(tool: ToolRecord): boolean {
  return tool.status === "ready" && tool.visibility === "public";
}

function toPublicTool(tool: ToolRecord): PublicTool {
  return {
    id: tool.id,
    slug: tool.slug,
    name: tool.name,
    description: tool.description,
    categoryId: tool.categoryId,
    tags: [...tool.tags],
  };
}

function toPublicCategory(category: CategoryRecord): PublicCategory {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
  };
}

export interface PublicProjection {
  tools: PublicTool[];
  categories: PublicCategory[];
}

export function projectPublic(tools: ToolRecord[], categories: CategoryRecord[]): PublicProjection {
  const eligibleTools = tools.filter(isEligibleTool);
  const categoryIdsWithPublicTools = new Set(eligibleTools.map((t) => t.categoryId));

  const publicCategories = categories.filter(
    (c) => c.visibility === "public" && categoryIdsWithPublicTools.has(c.id),
  );

  return {
    tools: eligibleTools.map(toPublicTool),
    categories: publicCategories.map(toPublicCategory),
  };
}