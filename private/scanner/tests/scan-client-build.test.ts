import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scanClientBuild,
  buildDefaultScanConfig,
  type ScanConfig,
} from "../scan-client-build";

interface CleanFixture {
  root: string;
}

async function buildCleanFixture(): Promise<CleanFixture> {
  const root = await mkdtemp(join(tmpdir(), "scan-"));
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(
    join(root, "index.html"),
    '<!DOCTYPE html><html><head><title>Home</title></head><body><div id="root"></div></body></html>',
  );
  await writeFile(
    join(root, "assets", "app-abc123.js"),
    'function App() { return React.createElement("div", null, "Hello"); } const loadedMetadata = 42; console.log(loadedMetadata);',
  );
  await writeFile(
    join(root, "assets", "styles-def456.css"),
    "body { margin: 0; }",
  );
  return { root };
}

function testConfig(root: string, overrides: Partial<ScanConfig> = {}): ScanConfig {
  return {
    buildClientDir: root,
    privateFieldNames: ["contentId", "exportName", "implementation", "metadata"],
    privateMetadataPatterns: [/metadata\.notes/],
    implementationPathPatterns: [/["'][/\\]+[^"']*[/\\]src[\\/]+tools[\\/]/],
    forbiddenAbsolutePathPrefixes: ["C:\\private\\secret", "D:\\ad sense"],
    privateDocMarkers: ["# Internal Documentation", "# Internal Security Notes"],
    forbiddenFileExtensions: [".map"],
    ...overrides,
  };
}

describe("scanClientBuild", () => {
  let fixture: CleanFixture;

  beforeEach(async () => {
    fixture = await buildCleanFixture();
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("passes on a clean client build", async () => {
    const result = await scanClientBuild(testConfig(fixture.root));
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.filesScanned).toBeGreaterThan(0);
  });

  it("does not false-positive on 'loadedMetadata' identifier", async () => {
    // Fixture already contains loadedMetadata in app-abc123.js
    const result = await scanClientBuild(testConfig(fixture.root));
    expect(result.ok).toBe(true);
  });

  it("detects private field name contentId", async () => {
    await writeFile(
      join(fixture.root, "assets", "leak1.js"),
      'const x = { contentId: "abc" };',
    );
    const result = await scanClientBuild(testConfig(fixture.root));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.category === "private-field")).toBe(true);
  });

  it("detects private field name exportName", async () => {
    await writeFile(
      join(fixture.root, "assets", "leak2.js"),
      'const y = { exportName: "Foo" };',
    );
    const result = await scanClientBuild(testConfig(fixture.root));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.category === "private-field")).toBe(true);
  });

  it("detects private field name implementation as object key", async () => {
    await writeFile(
      join(fixture.root, "assets", "leak3.js"),
      'const z = { "implementation": { module: "x" } };',
    );
    const result = await scanClientBuild(testConfig(fixture.root));
    expect(result.ok).toBe(false);
  });

  it("does NOT flag bare word implementation if not used as a key", async () => {
    await writeFile(
      join(fixture.root, "assets", "safe1.js"),
      'const implementation = "not a leak"; console.log(implementation);',
    );
    const result = await scanClientBuild(testConfig(fixture.root));
    // "implementation:" appears via console.log? No, `implementation)` and `= "not...` do not form `"implementation":`. Safe.
    expect(result.ok).toBe(true);
  });

  it("detects metadata.notes private metadata pattern", async () => {
    await writeFile(
      join(fixture.root, "assets", "leak4.js"),
      'const m = { metadata: { notes: "private note" } }; console.log(m.metadata.notes);',
    );
    const result = await scanClientBuild(testConfig(fixture.root));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.category === "private-metadata")).toBe(true);
  });

  it("detects absolute implementation path patterns", async () => {
    await writeFile(
      join(fixture.root, "assets", "leak5.js"),
      'const p = "/home/user/project/src/tools/test-tool/index.tsx";',
    );
    const result = await scanClientBuild(testConfig(fixture.root));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.category === "implementation-path")).toBe(true);
  });

  it("does NOT flag relative glob-manifest style import specifiers", async () => {
    await writeFile(
      join(fixture.root, "assets", "safe-glob.js"),
      'const paths = ["../../../src/tools/foo/index.tsx", "../../../src/tools/bar/index.tsx"];',
    );
    const result = await scanClientBuild(testConfig(fixture.root));
    expect(result.ok).toBe(true);
  });

  it("detects absolute private path prefixes", async () => {
    await writeFile(
      join(fixture.root, "assets", "leak6.js"),
      'const p = "C:\\private\\secret\\data.json";',
    );
    const result = await scanClientBuild(testConfig(fixture.root));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.category === "absolute-path")).toBe(true);
  });

  it("detects internal documentation markers", async () => {
    await writeFile(
      join(fixture.root, "assets", "leak7.js"),
      '/* # Internal Documentation — do not ship */',
    );
    const result = await scanClientBuild(testConfig(fixture.root));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.category === "doc-leak")).toBe(true);
  });

  it("detects source map files", async () => {
    await writeFile(join(fixture.root, "assets", "app-abc123.js.map"), '{}');
    const result = await scanClientBuild(testConfig(fixture.root));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.category === "source-map")).toBe(true);
  });

  it("fails when buildClientDir does not exist", async () => {
    const result = await scanClientBuild(testConfig(join(fixture.root, "missing")));
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.category).toBe("server-artifact");
  });

  it("does not include absolute paths in violation messages", async () => {
    await writeFile(
      join(fixture.root, "assets", "leak8.js"),
      'const p = "C:\\private\\secret\\data.json";',
    );
    const result = await scanClientBuild(testConfig(fixture.root));
    const v = result.violations[0];
    if (!v) throw new Error("Expected a violation");
    expect(v.file).not.toContain(fixture.root);
    expect(v.matchedRule).not.toContain("C:\\private");
  });

  it("buildDefaultScanConfig uses TOOLS_CONTENT_PATH from environment", () => {
    const original = process.env.TOOLS_CONTENT_PATH;
    try {
      process.env.TOOLS_CONTENT_PATH = "D:\\custom\\content-path";
      const config = buildDefaultScanConfig("/tmp/build-client");
      expect(config.forbiddenAbsolutePathPrefixes).toContain("D:\\custom\\content-path");
    } finally {
      if (original === undefined) delete process.env.TOOLS_CONTENT_PATH;
      else process.env.TOOLS_CONTENT_PATH = original;
    }
  });

  it("buildDefaultScanConfig includes default field names", () => {
    const config = buildDefaultScanConfig("/tmp/build-client");
    expect(config.privateFieldNames).toContain("contentId");
    expect(config.privateFieldNames).toContain("exportName");
    expect(config.privateFieldNames).toContain("implementation");
    expect(config.forbiddenFileExtensions).toContain(".map");
  });
});