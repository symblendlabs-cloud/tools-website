import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveContentRoot,
  resolveInsideRoot,
  assertRequiredSource,
  loadToolContentFiles,
  loadArticleFiles,
  type ContentSource,
} from "../load-content";

async function canSymlink(): Promise<boolean> {
  const probeRoot = await mkdtemp(join(tmpdir(), "symlink-probe-"));
  try {
    await writeFile(join(probeRoot, "target"), "x");
    try {
      await symlink(join(probeRoot, "target"), join(probeRoot, "link"));
      return true;
    } catch {
      return false;
    }
  } finally {
    await rm(probeRoot, { recursive: true, force: true });
  }
}

describe("resolveContentRoot", () => {
  const original = process.env.TOOLS_CONTENT_PATH;
  afterEach(() => {
    if (original === undefined) delete process.env.TOOLS_CONTENT_PATH;
    else process.env.TOOLS_CONTENT_PATH = original;
  });

  it("throws when missing", () => {
    delete process.env.TOOLS_CONTENT_PATH;
    expect(() => resolveContentRoot()).toThrow(/not set/);
  });

  it("throws when relative", () => {
    process.env.TOOLS_CONTENT_PATH = "relative/path";
    expect(() => resolveContentRoot()).toThrow(/absolute/);
  });

  it("accepts absolute", () => {
    process.env.TOOLS_CONTENT_PATH = "D:\\tmp\\content";
    expect(resolveContentRoot().root).toContain("tmp");
  });
});

describe("resolveInsideRoot", () => {
  const source: ContentSource = { root: "C:\\content" };

  it("resolves normal path", () => {
    expect(resolveInsideRoot(source, "tools/a.json").endsWith("tools\\a.json")).toBe(true);
  });

  it("rejects ..", () => {
    expect(() => resolveInsideRoot(source, "../escape.json")).toThrow(/escapes/);
  });

  it("rejects absolute", () => {
    expect(() => resolveInsideRoot(source, "/etc/passwd")).toThrow(/relative/);
  });

  it("rejects null byte", () => {
    expect(() => resolveInsideRoot(source, "tools/a\0.json")).toThrow(/invalid/);
  });
});

describe("assertRequiredSource", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "content-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("passes for a real directory", async () => {
    await mkdir(join(tmp, "tools"));
    await expect(assertRequiredSource({ root: tmp }, "tools", "directory")).resolves.toBeUndefined();
  });

  it("passes for a real file", async () => {
    await mkdir(join(tmp, "schemas"));
    await writeFile(join(tmp, "schemas", "s.json"), "{}");
    await expect(
      assertRequiredSource({ root: tmp }, "schemas/s.json", "file"),
    ).resolves.toBeUndefined();
  });

  it("fails when missing", async () => {
    await expect(
      assertRequiredSource({ root: tmp }, "tools", "directory"),
    ).rejects.toThrow(/missing/);
  });

  it("rejects symlinked directory", async () => {
    if (!(await canSymlink())) return;
    const externalDir = await mkdtemp(join(tmpdir(), "external-"));
    try {
      await mkdir(join(externalDir, "target-dir"));
      await symlink(join(externalDir, "target-dir"), join(tmp, "tools"));
      await expect(
        assertRequiredSource({ root: tmp }, "tools", "directory"),
      ).rejects.toThrow(/Symlinked/);
    } finally {
      await rm(externalDir, { recursive: true, force: true });
    }
  });

  it("rejects symlinked file", async () => {
    if (!(await canSymlink())) return;
    const externalDir = await mkdtemp(join(tmpdir(), "external-"));
    try {
      await mkdir(join(tmp, "schemas"));
      await writeFile(join(externalDir, "target.json"), "{}");
      await symlink(join(externalDir, "target.json"), join(tmp, "schemas", "s.json"));
      await expect(
        assertRequiredSource({ root: tmp }, "schemas/s.json", "file"),
      ).rejects.toThrow(/Symlinked/);
    } finally {
      await rm(externalDir, { recursive: true, force: true });
    }
  });
});

describe("loadToolContentFiles", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "content-"));
    await mkdir(join(tmp, "tools"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("loads JSON files", async () => {
    await writeFile(join(tmp, "tools", "a.json"), JSON.stringify({ id: "a" }));
    const files = await loadToolContentFiles({ root: tmp });
    expect(files).toHaveLength(1);
    const first = files[0];
    if (!first) throw new Error("Expected first loaded file");
    expect((first.data as { id: string }).id).toBe("a");
  });

  it("returns empty when tools missing", async () => {
    await rm(join(tmp, "tools"), { recursive: true });
    expect(await loadToolContentFiles({ root: tmp })).toEqual([]);
  });

  it("rejects symlinked file inside tools/", async () => {
    if (!(await canSymlink())) return;
    const externalDir = await mkdtemp(join(tmpdir(), "external-"));
    try {
      await writeFile(join(externalDir, "external.json"), "{}");
      await symlink(join(externalDir, "external.json"), join(tmp, "tools", "linked.json"));
      await expect(loadToolContentFiles({ root: tmp })).rejects.toThrow(/Symlinked/);
    } finally {
      await rm(externalDir, { recursive: true, force: true });
    }
  });

  it("rejects symlinked nested directory", async () => {
    if (!(await canSymlink())) return;
    const externalDir = await mkdtemp(join(tmpdir(), "external-"));
    try {
      await mkdir(join(externalDir, "nested"));
      await writeFile(join(externalDir, "nested", "a.json"), "{}");
      await symlink(join(externalDir, "nested"), join(tmp, "tools", "linked"));
      await expect(loadToolContentFiles({ root: tmp })).rejects.toThrow(/Symlinked/);
    } finally {
      await rm(externalDir, { recursive: true, force: true });
    }
  });
});

describe("loadArticleFiles", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "content-"));
    await mkdir(join(tmp, "articles"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("loads markdown files", async () => {
    await writeFile(join(tmp, "articles", "a.md"), "---\nid: a\n---\nBody");
    expect(await loadArticleFiles({ root: tmp })).toHaveLength(1);
  });

  it("returns empty when articles missing", async () => {
    await rm(join(tmp, "articles"), { recursive: true });
    expect(await loadArticleFiles({ root: tmp })).toEqual([]);
  });
});