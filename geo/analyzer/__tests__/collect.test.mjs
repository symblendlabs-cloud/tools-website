import { describe, it, expect } from "vitest";
import { collectFromContent } from "../collect.mjs";

describe("collectFromContent — error paths", () => {
  it("throws when origin is not HTTPS", async () => {
    await expect(
      collectFromContent({ origin: "http://example.com" }),
    ).rejects.toThrow(/HTTPS/);
  });

  it("throws when origin is not a string", async () => {
    await expect(collectFromContent({ origin: undefined })).rejects.toThrow(
      /HTTPS/,
    );
  });

  it("throws with a clear message when content loading fails", async () => {
    // The real getSiteContent reads TOOLS_CONTENT_PATH. In a test environment
    // without that variable set, it should throw. If the test environment
    // happens to have it set, this test will fail; in that case, unset the
    // variable before the test.
    const original = process.env.TOOLS_CONTENT_PATH;
    delete process.env.TOOLS_CONTENT_PATH;
    try {
      await expect(
        collectFromContent({ origin: "https://example.com" }),
      ).rejects.toThrow(/failed to load public content/);
    } finally {
      if (original !== undefined) process.env.TOOLS_CONTENT_PATH = original;
    }
  });
});

describe("collectFromContent — real content", () => {
  it("collects pages from the real public content projection", async () => {
    if (!process.env.TOOLS_CONTENT_PATH) {
      // Skip when the content repository is not configured in the test env.
      return;
    }
    const { pages } = await collectFromContent({
      origin: "https://chifral.pages.dev",
    });
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(page.url.startsWith("https://chifral.pages.dev/")).toBe(true);
      expect(["tool", "guide", "category"]).toContain(page.type);
      expect(typeof page.title).toBe("string");
      expect(typeof page.description).toBe("string");
    }
  });
});