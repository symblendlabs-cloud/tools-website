import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateOrigin,
  findIndexFiles,
  toUrlPath,
  sortUrls,
  buildSitemapXml,
  buildRobotsTxt,
  generate,
} from "../generate-sitemap.mjs";

// ─── validateOrigin ────────────────────────────────────────────────
describe("validateOrigin", () => {
  it("accepts a bare HTTPS origin", () => {
    const r = validateOrigin("https://example.com");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.origin).toBe("https://example.com");
  });

  it("accepts a trailing slash and normalizes to bare origin", () => {
    const r = validateOrigin("https://example.com/");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.origin).toBe("https://example.com");
  });

  it("accepts a port and preserves it", () => {
    const r = validateOrigin("https://example.com:8443");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.origin).toBe("https://example.com:8443");
  });

  it("trims leading and trailing whitespace before parsing", () => {
    const r = validateOrigin("  https://example.com  ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.origin).toBe("https://example.com");
  });

  it("rejects an empty string", () => {
    expect(validateOrigin("").ok).toBe(false);
  });

  it("rejects a whitespace-only string", () => {
    expect(validateOrigin("   ").ok).toBe(false);
  });

  it("rejects undefined", () => {
    expect(validateOrigin(undefined).ok).toBe(false);
  });

  it("rejects HTTP", () => {
    expect(validateOrigin("http://example.com").ok).toBe(false);
  });

  it("rejects a value without a scheme", () => {
    expect(validateOrigin("example.com").ok).toBe(false);
  });

  it("rejects a URL with credentials", () => {
    expect(validateOrigin("https://user:pass@example.com").ok).toBe(false);
  });

  it("rejects a URL with a path", () => {
    expect(validateOrigin("https://example.com/path").ok).toBe(false);
  });

  it("rejects a URL with a query string", () => {
    expect(validateOrigin("https://example.com/?q=1").ok).toBe(false);
  });

  it("rejects a URL with a fragment", () => {
    expect(validateOrigin("https://example.com/#frag").ok).toBe(false);
  });
});

// ─── toUrlPath ─────────────────────────────────────────────────────
describe("toUrlPath", () => {
  const buildClientDir = join("/tmp", "fake-build", "client");

  it("maps build/client/index.html to /", () => {
    const full = join(buildClientDir, "index.html");
    expect(toUrlPath(full, buildClientDir)).toBe("/");
  });

  it("maps a nested index.html to its route", () => {
    const full = join(buildClientDir, "tools", "foo", "index.html");
    expect(toUrlPath(full, buildClientDir)).toBe("/tools/foo");
  });
});

// ─── sortUrls ──────────────────────────────────────────────────────
describe("sortUrls", () => {
  it("places / first, then sorts alphabetically", () => {
    expect(sortUrls(["/b", "/", "/a"])).toEqual(["/", "/a", "/b"]);
  });

  it("is stable for already-sorted input", () => {
    expect(sortUrls(["/", "/a", "/b"])).toEqual(["/", "/a", "/b"]);
  });
});

// ─── findIndexFiles ────────────────────────────────────────────────
describe("findIndexFiles", () => {
  let root;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "sitemap-"));
    await mkdir(join(root, "tools", "foo"), { recursive: true });
    await mkdir(join(root, "404"), { recursive: true });
    await mkdir(join(root, "__dev-preview"), { recursive: true });
    await writeFile(join(root, "index.html"), "");
    await writeFile(join(root, "tools", "foo", "index.html"), "");
    await writeFile(join(root, "404", "index.html"), "");
    await writeFile(join(root, "__dev-preview", "index.html"), "");
    await writeFile(join(root, "styles.css"), "");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("finds root and nested index.html files", async () => {
    const files = await findIndexFiles(root);
    const names = files.map((f) => f.slice(root.length).replace(/\\/g, "/"));
    expect(names).toContain("/index.html");
    expect(names).toContain("/tools/foo/index.html");
  });

  it("excludes 404 directory", async () => {
    const files = await findIndexFiles(root);
    const names = files.map((f) => f.slice(root.length).replace(/\\/g, "/"));
    expect(names.some((n) => n.includes("/404/"))).toBe(false);
  });

  it("excludes __dev-preview directory", async () => {
    const files = await findIndexFiles(root);
    const names = files.map((f) => f.slice(root.length).replace(/\\/g, "/"));
    expect(names.some((n) => n.includes("/__dev-preview/"))).toBe(false);
  });

  it("ignores non-index.html files", async () => {
    const files = await findIndexFiles(root);
    const names = files.map((f) => f.slice(root.length).replace(/\\/g, "/"));
    expect(names.some((n) => n.endsWith(".css"))).toBe(false);
  });
});

// ─── buildSitemapXml ───────────────────────────────────────────────
describe("buildSitemapXml", () => {
  const origin = "https://example.com";

  it("renders root as origin with trailing slash, never /index.html", () => {
    const xml = buildSitemapXml(["/"], origin);
    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).not.toContain("/index.html");
  });

  it("renders nested routes", () => {
    const xml = buildSitemapXml(["/tools/foo"], origin);
    expect(xml).toContain("<loc>https://example.com/tools/foo</loc>");
  });

  it("sorts URLs deterministically with root first", () => {
    const xml = buildSitemapXml(["/b", "/", "/a"], origin);
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      "https://example.com/",
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });

  it("wraps in a urlset element", () => {
    const xml = buildSitemapXml(["/"], origin);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("</urlset>");
  });

  it("throws on empty URL list", () => {
    expect(() => buildSitemapXml([], origin)).toThrow(/No eligible pages/);
  });
});

// ─── buildRobotsTxt ────────────────────────────────────────────────
describe("buildRobotsTxt", () => {
  const origin = "https://example.com";

  it("contains dev preview and 404 disallows", () => {
    const txt = buildRobotsTxt(origin);
    expect(txt).toContain("Disallow: /__dev-preview");
    expect(txt).toContain("Disallow: /404");
  });

  it("contains the sitemap URL", () => {
    const txt = buildRobotsTxt(origin);
    expect(txt).toContain("Sitemap: https://example.com/sitemap.xml");
  });
});

// ─── generate (integration against temp dir) ───────────────────────
describe("generate", () => {
  let root;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "sitemap-gen-"));
    await mkdir(join(root, "tools", "foo"), { recursive: true });
    await mkdir(join(root, "404"), { recursive: true });
    await mkdir(join(root, "__dev-preview"), { recursive: true });
    await writeFile(join(root, "index.html"), "");
    await writeFile(join(root, "tools", "foo", "index.html"), "");
    await writeFile(join(root, "404", "index.html"), "");
    await writeFile(join(root, "__dev-preview", "index.html"), "");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes sitemap.xml and robots.txt with excluded routes omitted", async () => {
    const { urlCount } = await generate({
      buildClientDir: root,
      origin: "https://example.com",
    });
    expect(urlCount).toBe(2);

    const sitemap = await readFile(join(root, "sitemap.xml"), "utf8");
    expect(sitemap).toContain("<loc>https://example.com/</loc>");
    expect(sitemap).toContain("<loc>https://example.com/tools/foo</loc>");
    expect(sitemap).not.toContain("/404");
    expect(sitemap).not.toContain("/__dev-preview");

    const robots = await readFile(join(root, "robots.txt"), "utf8");
    expect(robots).toContain("Disallow: /404");
    expect(robots).toContain("Disallow: /__dev-preview");
  });

  it("throws when no eligible pages exist", async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), "sitemap-empty-"));
    try {
      await expect(
        generate({ buildClientDir: emptyRoot, origin: "https://example.com" }),
      ).rejects.toThrow(/No eligible pages/);
    } finally {
      await rm(emptyRoot, { recursive: true, force: true });
    }
  });
});