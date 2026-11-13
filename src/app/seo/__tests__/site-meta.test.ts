import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// site-meta.ts reads import.meta.env.VITE_SITE_ORIGIN at module load.
// To test different origin values, we reset the module between tests.
// The `define` in vite.config.ts is NOT applied in Vitest (vitest.config.ts
// does not include it), so `import.meta.env.VITE_SITE_ORIGIN` is undefined
// by default in tests — which is exactly what we want for the "unset" test.

describe("getSiteOrigin", () => {
  const original = import.meta.env.VITE_SITE_ORIGIN;

  afterEach(() => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = original;
    vi.resetModules();
  });

  it("returns null when origin is unset", async () => {
    delete (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN;
    vi.resetModules();
    const { getSiteOrigin } = await import("../site-meta");
    expect(getSiteOrigin()).toBeNull();
  });

  it("returns null when origin is empty string", async () => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = "";
    vi.resetModules();
    const { getSiteOrigin } = await import("../site-meta");
    expect(getSiteOrigin()).toBeNull();
  });

  it("returns the origin when valid HTTPS origin is set", async () => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = "https://example.com";
    vi.resetModules();
    const { getSiteOrigin } = await import("../site-meta");
    expect(getSiteOrigin()).toBe("https://example.com");
  });

  it("throws for unparseable URL", async () => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = "not a url";
    vi.resetModules();
    const { getSiteOrigin } = await import("../site-meta");
    expect(() => getSiteOrigin()).toThrow(/valid URL/);
  });

  it("throws for HTTP (non-HTTPS) origin", async () => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = "http://example.com";
    vi.resetModules();
    const { getSiteOrigin } = await import("../site-meta");
    expect(() => getSiteOrigin()).toThrow(/HTTPS/);
  });

  it("throws for origin with credentials", async () => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = "https://user:pass@example.com";
    vi.resetModules();
    const { getSiteOrigin } = await import("../site-meta");
    expect(() => getSiteOrigin()).toThrow(/credentials/);
  });

  it("throws for origin with a path", async () => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = "https://example.com/subpath";
    vi.resetModules();
    const { getSiteOrigin } = await import("../site-meta");
    expect(() => getSiteOrigin()).toThrow(/bare origin/);
  });

  it("throws for origin with query string", async () => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = "https://example.com?x=1";
    vi.resetModules();
    const { getSiteOrigin } = await import("../site-meta");
    expect(() => getSiteOrigin()).toThrow(/query or fragment/);
  });

  it("throws for origin with fragment", async () => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = "https://example.com#section";
    vi.resetModules();
    const { getSiteOrigin } = await import("../site-meta");
    expect(() => getSiteOrigin()).toThrow(/query or fragment/);
  });
});

describe("canonicalUrl", () => {
  const original = import.meta.env.VITE_SITE_ORIGIN;

  afterEach(() => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = original;
    vi.resetModules();
  });

  it("returns null when origin is unset", async () => {
    delete (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN;
    vi.resetModules();
    const { canonicalUrl } = await import("../site-meta");
    expect(canonicalUrl("/tools")).toBeNull();
  });

  it("returns full URL when origin is set", async () => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = "https://example.com";
    vi.resetModules();
    const { canonicalUrl } = await import("../site-meta");
    expect(canonicalUrl("/tools")).toBe("https://example.com/tools/");
  });

  it("handles paths without leading slash", async () => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = "https://example.com";
    vi.resetModules();
    const { canonicalUrl } = await import("../site-meta");
    expect(canonicalUrl("tools")).toBe("https://example.com/tools/");
  });

    it("appends a trailing slash to non-root paths", async () => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = "https://example.com";
    vi.resetModules();
    const { canonicalUrl } = await import("../site-meta");
    expect(canonicalUrl("/tools")).toBe("https://example.com/tools/");
    expect(canonicalUrl("/tools/foo")).toBe("https://example.com/tools/foo/");
  });

  it("does not duplicate trailing slashes", async () => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = "https://example.com";
    vi.resetModules();
    const { canonicalUrl } = await import("../site-meta");
    expect(canonicalUrl("/tools/")).toBe("https://example.com/tools/");
    expect(canonicalUrl("/tools//")).toBe("https://example.com/tools/");
  });

  it("keeps root as origin + /", async () => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = "https://example.com";
    vi.resetModules();
    const { canonicalUrl } = await import("../site-meta");
    expect(canonicalUrl("/")).toBe("https://example.com/");
  });

  it("strips query strings and fragments from the path", async () => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = "https://example.com";
    vi.resetModules();
    const { canonicalUrl } = await import("../site-meta");
    expect(canonicalUrl("/tools?x=1")).toBe("https://example.com/tools/");
    expect(canonicalUrl("/tools#frag")).toBe("https://example.com/tools/");
  });
});

describe("buildPageMeta", () => {
  const original = import.meta.env.VITE_SITE_ORIGIN;

  afterEach(() => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = original;
    vi.resetModules();
  });

  it("does not throw when origin is unset — browser metadata generation does not require process", async () => {
    delete (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN;
    vi.resetModules();
    const { buildPageMeta } = await import("../site-meta");
    const meta = buildPageMeta({
      title: "Test",
      description: "Test description",
      path: "/test",
    });
    expect(meta.length).toBeGreaterThan(0);
    // Canonical is omitted when origin unset
    const canonical = meta.find(
      (m) => (m as { rel?: string }).rel === "canonical",
    );
    expect(canonical).toBeUndefined();
  });

  it("includes canonical URL when origin is set", async () => {
    (import.meta.env as Record<string, unknown>).VITE_SITE_ORIGIN = "https://example.com";
    vi.resetModules();
    const { buildPageMeta } = await import("../site-meta");
    const meta = buildPageMeta({
      title: "Test",
      description: "Test description",
      path: "/test",
    });
    const canonical = meta.find(
      (m) => (m as { rel?: string }).rel === "canonical",
    ) as { href?: string } | undefined;
    expect(canonical?.href).toBe("https://example.com/test/");
  });
});