import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectFromBuild } from "../collect-build.mjs";

let root;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "geo-build-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("collectFromBuild — error paths", () => {
  it("throws when build dir does not exist", async () => {
    await expect(
      collectFromBuild({ buildDir: join(root, "missing"), origin: "https://example.com" }),
    ).rejects.toThrow(/does not exist/);
  });

  it("throws when origin is not HTTPS", async () => {
    await expect(
      collectFromBuild({ buildDir: root, origin: "http://example.com" }),
    ).rejects.toThrow(/HTTPS/);
  });

  it("throws when build dir has no HTML files", async () => {
    await expect(
      collectFromBuild({ buildDir: root, origin: "https://example.com" }),
    ).rejects.toThrow(/no HTML files/);
  });

  it("throws when build dir has no eligible pages", async () => {
    await writeFile(join(root, "__spa-fallback.html"), "<html></html>");
    await expect(
      collectFromBuild({ buildDir: root, origin: "https://example.com" }),
    ).rejects.toThrow(/no eligible public pages/);
  });
});

describe("collectFromBuild — real pages", () => {
  it("collects index and nested index pages", async () => {
    await writeFile(join(root, "index.html"), "<html><head><title>Home</title></head><body><main><h1>Home</h1></main></body></html>");
    await mkdir(join(root, "tools", "foo"), { recursive: true });
    await writeFile(join(root, "tools", "foo", "index.html"), "<html><head><title>Foo</title></head><body><main><h1>Foo</h1></main></body></html>");
    const { pages } = await collectFromBuild({ buildDir: root, origin: "https://example.com" });
    expect(pages.length).toBe(2);
    expect(pages.map((p) => p.type)).toEqual(expect.arrayContaining(["home", "tool"]));
  });

  it("excludes __dev-preview and 404", async () => {
    await mkdir(join(root, "__dev-preview"), { recursive: true });
    await mkdir(join(root, "404"), { recursive: true });
    await writeFile(join(root, "__dev-preview", "index.html"), "<html></html>");
    await writeFile(join(root, "404", "index.html"), "<html></html>");
    await writeFile(join(root, "index.html"), "<html><head><title>Home</title></head><body></body></html>");
    const { pages } = await collectFromBuild({ buildDir: root, origin: "https://example.com" });
    expect(pages.map((p) => p.url)).not.toContain("https://example.com/__dev-preview/");
    expect(pages.map((p) => p.url)).not.toContain("https://example.com/404/");
  });
});