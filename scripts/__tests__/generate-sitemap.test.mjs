import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateOrigin,
  normalizeBasePath,
  findIndexFiles,
  toUrlPath,
  sortUrls,
  buildSitemapXml,
  buildRobotsTxt,
  generate,
} from "../generate-sitemap.mjs";

// â”€â”€â”€ validateOrigin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ toUrlPath â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe("toUrlPath", () => {
  const buildClientDir = join("/tmp", "fake-build", "client");

  it("maps build/client/index.html to /", () => {
    const full = join(buildClientDir, "index.html");
    expect(toUrlPath(full, buildClientDir)).toBe("/");
  });

  it("maps a nested index.html to its route", () => {
    const full = join(buildClientDir, "tools", "foo", "index.html");
    expect(toUrlPath(full, buildClientDir)).toBe("/tools/foo/");
  });
});

// â”€â”€â”€ sortUrls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe("sortUrls", () => {
  it("places / first, then sorts alphabetically", () => {
    expect(sortUrls(["/b", "/", "/a"])).toEqual(["/", "/a", "/b"]);
  });

  it("is stable for already-sorted input", () => {
    expect(sortUrls(["/", "/a", "/b"])).toEqual(["/", "/a", "/b"]);
  });
});

// â”€â”€â”€ findIndexFiles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ buildSitemapXml â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe("buildSitemapXml", () => {
  const origin = "https://example.com";

  it("includes the GitHub Pages project base path", () => {
  const xml = buildSitemapXml(
    ["/", "/tools/foo/"],
    origin,
    "/tools-website/",
  );

  expect(xml).toContain(
    "<loc>https://example.com/tools-website/</loc>",
  );
  expect(xml).toContain(
    "<loc>https://example.com/tools-website/tools/foo/</loc>",
  );
});

  it("renders root as origin with trailing slash, never /index.html", () => {
    const xml = buildSitemapXml(["/"], origin);
    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).not.toContain("/index.html");
  });

  it("renders nested routes", () => {
    const xml = buildSitemapXml(["/tools/foo"], origin);
    expect(xml).toContain("<loc>https://example.com/tools/foo/</loc>");
  });

  it("sorts URLs deterministically with root first", () => {
    const xml = buildSitemapXml(["/b", "/", "/a"], origin);
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      "https://example.com/",
      "https://example.com/a/",
      "https://example.com/b/",
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

    it("handles already-normalized paths", () => {
    const xml = buildSitemapXml(["/tools/foo/", "/tools/bar/"], origin);
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      "https://example.com/tools/bar/",
      "https://example.com/tools/foo/",
    ]);
  });

  it("collapses duplicate trailing slashes", () => {
    const xml = buildSitemapXml(["/tools/foo///", "/tools/bar//"], origin);
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      "https://example.com/tools/bar/",
      "https://example.com/tools/foo/",
    ]);
  });

  it("preserves the root path as origin + /", () => {
    const xml = buildSitemapXml(["/"], origin);
    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).not.toContain("//</loc>");
  });

  it("eliminates duplicate URLs after normalization", () => {
    const xml = buildSitemapXml(
      ["/tools/foo", "/tools/foo/", "/tools/foo///", "/tools/foo/"],
      origin,
    );
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(["https://example.com/tools/foo/"]);
  });

  it("preserves root-first ordering after deduplication", () => {
    const xml = buildSitemapXml(["/b", "/", "/a", "/a/"], origin);
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      "https://example.com/",
      "https://example.com/a/",
      "https://example.com/b/",
    ]);
  });
});

// â”€â”€â”€ buildRobotsTxt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe("buildRobotsTxt", () => {
  const origin = "https://example.com";

  it("includes the GitHub Pages project base path", () => {
  const txt = buildRobotsTxt(origin, "/tools-website/");

  expect(txt).toContain(
    "Sitemap: https://example.com/tools-website/sitemap.xml",
  );
  expect(txt).toContain("Disallow: /tools-website/404");
  expect(txt).toContain("Disallow: /tools-website/__dev-preview");
});

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

// â”€â”€â”€ generate (integration against temp dir) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    expect(sitemap).toContain("<loc>https://example.com/tools/foo/</loc>");
    expect(sitemap).not.toContain("/404");
    expect(sitemap).not.toContain("/__dev-preview");

    const robots = await readFile(join(root, "robots.txt"), "utf8");
    expect(robots).toContain("Disallow: /404");
    expect(robots).toContain("Disallow: /__dev-preview");
  });

  it("generates correct URLs from a nested GitHub Pages deployment directory", async () => {
    const deploymentDir = join(root, "tools-website");
    await mkdir(join(deploymentDir, "about"), { recursive: true });
    await writeFile(join(deploymentDir, "index.html"), "");
    await writeFile(join(deploymentDir, "about", "index.html"), "");

    const { urlCount } = await generate({
      buildClientDir: root,
      origin: "https://symblendlabs-cloud.github.io",
      basePath: "/tools-website/",
    });

    expect(urlCount).toBe(2);

    const sitemap = await readFile(join(deploymentDir, "sitemap.xml"), "utf8");
    expect(sitemap).toContain(
      "<loc>https://symblendlabs-cloud.github.io/tools-website/</loc>",
    );
    expect(sitemap).toContain(
      "<loc>https://symblendlabs-cloud.github.io/tools-website/about/</loc>",
    );
    expect(sitemap).not.toContain("/tools-website/tools-website/");

    const robots = await readFile(join(deploymentDir, "robots.txt"), "utf8");
    expect(robots).toContain(
      "Sitemap: https://symblendlabs-cloud.github.io/tools-website/sitemap.xml",
    );
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

describe("normalizeBasePath", () => {
  it("normalizes a project base path", () => {
    expect(normalizeBasePath("/tools-website/")).toBe("/tools-website");
  });

  it("returns empty string for root deployment", () => {
    expect(normalizeBasePath("/")).toBe("");
  });
});