import { describe, expect, it } from "vitest";
import type { CategoryRecord } from "../schema/category.schema";
import type { ToolRecord } from "../schema/tool.schema";
import { projectPublic, validateRegistry } from "./validate-registry";

function makeCategory(overrides: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    id: "developer-tools",
    slug: "developer-tools",
    name: "Developer Tools",
    description: "Utilities for developers.",
    status: "ready",
    visibility: "public",
    metadata: { notes: "" },
    ...overrides,
  };
}

function makeTool(overrides: Partial<ToolRecord> = {}): ToolRecord {
  return {
    id: "example-tool",
    slug: "example-tool",
    name: "Example Tool",
    description: "An example tool.",
    categoryId: "developer-tools",
    status: "ready",
    visibility: "public",
    implementation: {
      module: "src/tools/example-tool/index.tsx",
      exportName: "ExampleTool",
    },
    contentId: "example-tool",
    tags: ["example", "utility"],
    metadata: { notes: "internal only" },
    ...overrides,
  };
}

describe("validateRegistry", () => {
  it("accepts a valid tool and category", () => {
    const result = validateRegistry([makeTool()], [makeCategory()]);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects duplicate tool IDs", () => {
    const result = validateRegistry(
      [makeTool(), makeTool({ slug: "other-slug" })],
      [makeCategory()],
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("rejects duplicate tool slugs", () => {
    const result = validateRegistry(
      [makeTool(), makeTool({ id: "other-id" })],
      [makeCategory()],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate category IDs", () => {
    const result = validateRegistry(
      [],
      [makeCategory(), makeCategory({ slug: "other-category" })],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate category slugs", () => {
    const result = validateRegistry(
      [],
      [makeCategory(), makeCategory({ id: "other-id" })],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects invalid status", () => {
    const result = validateRegistry(
      [makeTool({ status: "unknown" as ToolRecord["status"] })],
      [makeCategory()],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects invalid visibility", () => {
    const result = validateRegistry(
      [makeTool({ visibility: "hidden" as ToolRecord["visibility"] })],
      [makeCategory()],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects tool with missing category", () => {
    const result = validateRegistry(
      [makeTool({ categoryId: "nonexistent" })],
      [makeCategory()],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects implementation path outside src/tools/", () => {
    const result = validateRegistry(
      [makeTool({ implementation: { module: "src/app/evil.tsx", exportName: "X" } })],
      [makeCategory()],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects implementation path traversal", () => {
    const result = validateRegistry(
      [makeTool({ implementation: { module: "src/tools/../evil.tsx", exportName: "X" } })],
      [makeCategory()],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects invalid export names", () => {
    const result = validateRegistry(
      [makeTool({ implementation: { module: "src/tools/x/index.tsx", exportName: "1bad" } })],
      [makeCategory()],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects malformed tags", () => {
    const result = validateRegistry(
      [makeTool({ tags: ["valid", "Not Valid"] })],
      [makeCategory()],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects missing required fields", () => {
    const broken = { ...makeTool() } as Record<string, unknown>;
    delete broken.description;
    const result = validateRegistry([broken], [makeCategory()]);
    expect(result.ok).toBe(false);
  });
});

describe("projectPublic", () => {
  it("includes only tools with status ready and visibility public", () => {
    const visible = makeTool({ id: "visible", slug: "visible" });
    const draft = makeTool({ id: "draft", slug: "draft", status: "testing" });
    const privateTool = makeTool({ id: "priv", slug: "priv", visibility: "private" });
    const projection = projectPublic([visible, draft, privateTool], [makeCategory()]);
    expect(projection.tools.map((t) => t.id)).toEqual(["visible"]);
  });

  it("excludes private fields from public projection", () => {
    const projection = projectPublic([makeTool()], [makeCategory()]);
    const tool = projection.tools[0] as unknown as Record<string, unknown>;
    expect(tool).not.toHaveProperty("metadata");
    expect(tool).not.toHaveProperty("implementation");
    expect(tool).not.toHaveProperty("contentId");
    expect(tool).not.toHaveProperty("status");
    expect(tool).not.toHaveProperty("visibility");
  });

  it("excludes categories without eligible public tools", () => {
    const emptyCategory = makeCategory({
      id: "empty-category",
      slug: "empty-category",
    });
    const usedCategory = makeCategory();
    const tool = makeTool();
    const projection = projectPublic([tool], [usedCategory, emptyCategory]);
    expect(projection.categories.map((c) => c.id)).toEqual(["developer-tools"]);
  });

  it("excludes private-visibility categories even if referenced by public tools", () => {
    const privateCategory = makeCategory({ visibility: "private" });
    const projection = projectPublic([makeTool()], [privateCategory]);
    expect(projection.categories).toEqual([]);
  });
});


// ─────────────────────────────────────────────────────────────
// Step: Additional Registry Security Tests
// ─────────────────────────────────────────────────────────────

describe("implementation path security", () => {
  const validCategory = makeCategory();
  const baseTool = makeTool();

  const invalidPaths = [
    { label: "absolute POSIX path", module: "/etc/passwd" },
    { label: "Windows drive-letter path", module: "C:\\tools\\evil.tsx" },
    { label: "UNC path", module: "\\\\server\\share\\evil.tsx" },
    { label: "backslash-based path", module: "src\\tools\\example\\index.tsx" },
    { label: "src/tools-evil path", module: "src/tools-evil/example/index.tsx" },
    { label: "multiple ../ traversal", module: "src/tools/../../etc/passwd" },
    { label: "empty path", module: "" },
    { label: "whitespace-only path", module: "   " },
    { label: "path with null byte", module: "src/tools/example\u0000/index.tsx" },
  ];

  for (const { label, module } of invalidPaths) {
    it(`rejects ${label}`, () => {
      const result = validateRegistry(
        [{ ...baseTool, implementation: { module, exportName: "X" } }],
        [validCategory],
      );
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  }

  it("accepts a valid relative path within src/tools/", () => {
    const result = validateRegistry(
      [{ ...baseTool, implementation: { module: "src/tools/example-tool/index.tsx", exportName: "ExampleTool" } }],
      [validCategory],
    );
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("record validation robustness", () => {
  const validCategory = makeCategory();
  const validTool = makeTool();

  it("rejects null tool record", () => {
    const result = validateRegistry([null], [validCategory]);
    expect(result.ok).toBe(false);
  });

  it("rejects non-object tool record", () => {
    const result = validateRegistry(["not-an-object"], [validCategory]);
    expect(result.ok).toBe(false);
  });

  it("rejects null category record", () => {
    const result = validateRegistry([validTool], [null]);
    expect(result.ok).toBe(false);
  });

  it("rejects non-object category record", () => {
    const result = validateRegistry([validTool], ["not-an-object"]);
    expect(result.ok).toBe(false);
  });

  it("rejects missing implementation object", () => {
    const broken = { ...validTool } as Record<string, unknown>;
    delete broken.implementation;
    const result = validateRegistry([broken], [validCategory]);
    expect(result.ok).toBe(false);
  });

  it("rejects wrongly typed implementation object", () => {
    const result = validateRegistry(
      [{ ...validTool, implementation: "src/tools/x/index.tsx" }],
      [validCategory],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects non-array tags", () => {
    const result = validateRegistry(
      [{ ...validTool, tags: "not-an-array" }],
      [validCategory],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects non-string tool id", () => {
    const result = validateRegistry(
      [{ ...validTool, id: 123 }],
      [validCategory],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects non-string tool slug", () => {
    const result = validateRegistry(
      [{ ...validTool, slug: 42 }],
      [validCategory],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects non-string tool name", () => {
    const result = validateRegistry(
      [{ ...validTool, name: null }],
      [validCategory],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects empty required strings", () => {
    const result = validateRegistry(
      [{ ...validTool, name: "" }],
      [validCategory],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects malformed category record with missing fields", () => {
    const broken = { id: "x", slug: "x" };
    const result = validateRegistry([], [broken]);
    expect(result.ok).toBe(false);
  });

  it("rejects entirely malformed registry input", () => {
    const result = validateRegistry("not-an-array" as unknown, "not-an-array" as unknown);
    expect(result.ok).toBe(false);
  });
});

describe("public projection security", () => {
  const category = makeCategory();

  it("never includes extra private properties", () => {
    const tool = {
      ...makeTool(),
      secret: "should-not-leak",
      internalFlag: true,
    } as ToolRecord & { secret: string; internalFlag: boolean };
    const projection = projectPublic([tool], [category]);
    const pub = projection.tools[0] as unknown as Record<string, unknown>;
    expect(pub).not.toHaveProperty("secret");
    expect(pub).not.toHaveProperty("internalFlag");
  });

  it("never includes nested private metadata", () => {
    const tool = makeTool({ metadata: { notes: "internal only" } });
    const projection = projectPublic([tool], [category]);
    const pub = projection.tools[0] as unknown as Record<string, unknown>;
    expect(pub).not.toHaveProperty("metadata");
  });

  it("never includes implementation paths or export names", () => {
    const projection = projectPublic([makeTool()], [category]);
    const pub = projection.tools[0] as unknown as Record<string, unknown>;
    expect(pub).not.toHaveProperty("implementation");
    expect(JSON.stringify(pub)).not.toContain("src/tools/");
  });

  it("never includes content IDs", () => {
    const projection = projectPublic([makeTool()], [category]);
    const pub = projection.tools[0] as unknown as Record<string, unknown>;
    expect(pub).not.toHaveProperty("contentId");
  });

  it("excludes non-ready tools regardless of visibility", () => {
    const statuses = ["planned", "in-progress", "testing", "deprecated"] as const;
    for (const status of statuses) {
      const projection = projectPublic([makeTool({ status })], [category]);
      expect(projection.tools).toEqual([]);
    }
  });

  it("excludes private tools regardless of status", () => {
    const projection = projectPublic(
      [makeTool({ visibility: "private" })],
      [category],
    );
    expect(projection.tools).toEqual([]);
  });

  it("excludes public categories without eligible tools", () => {
    const projection = projectPublic([], [makeCategory()]);
    expect(projection.categories).toEqual([]);
  });

  it("does not mutate the original registry records", () => {
    const tool = makeTool();
    const cat = makeCategory();
    const toolsSnapshot = JSON.stringify(tool);
    const catSnapshot = JSON.stringify(cat);
    projectPublic([tool], [cat]);
    expect(JSON.stringify(tool)).toBe(toolsSnapshot);
    expect(JSON.stringify(cat)).toBe(catSnapshot);
  });
});

describe("validation behavior — no uncaught exceptions", () => {
  it("returns structured result for null/undefined input", () => {
    expect(() => validateRegistry(null as unknown, null as unknown)).not.toThrow();
    expect(validateRegistry(null as unknown, null as unknown).ok).toBe(false);
  });

  it("returns structured result for mixed malformed array", () => {
    expect(() =>
      validateRegistry([null, 1, "x", {}] as unknown, [null, 1, "x", {}] as unknown),
    ).not.toThrow();
    const result = validateRegistry(
      [null, 1, "x", {}] as unknown,
      [null, 1, "x", {}] as unknown,
    );
    expect(result.ok).toBe(false);
    expect(Array.isArray(result.errors)).toBe(true);
  });
});