import { describe, it, expect } from "vitest";
import { buildReport } from "../report.mjs";

const geoRegistry = { version: 1, lastReviewed: "2026-11-13" };

function makePage(overrides = {}) {
  const url = overrides.url ?? "https://example.com/tools/foo/";
  return {
    url,
    type: "tool",
    title: "x".repeat(20),
    description: `Unique description for ${url} padded to a reasonable length.`,
    faqs: [],
    ...overrides,
  };
}

describe("buildReport", () => {
  it("produces the expected top-level shape", () => {
    const report = buildReport({
      pages: [makePage()],
      origin: "https://example.com",
      geoRegistry,
      mode: "source",
      analyzedAt: "2026-11-13T00:00:00Z",
    });
    expect(report).toHaveProperty("analyzedAt");
    expect(report).toHaveProperty("mode", "source");
    expect(report).toHaveProperty("origin", "https://example.com");
    expect(report).toHaveProperty("geoRegistryVersion", 1);
    expect(report).toHaveProperty("geoRegistryLastReviewed", "2026-11-13");
    expect(Array.isArray(report.pages)).toBe(true);
    expect(Array.isArray(report.siteChecks)).toBe(true);
    expect(report).toHaveProperty("summary");
  });

  it("classifies a page with no findings as no-blocking-findings", () => {
    const report = buildReport({
      pages: [makePage()],
      origin: "https://example.com",
      geoRegistry,
      mode: "source",
      analyzedAt: "2026-11-13T00:00:00Z",
    });
    expect(report.pages[0].classification).toBe("no-blocking-findings");
  });

  it("classifies a page with a warning as review-recommended", () => {
    const page = makePage({ title: "JSON" });
    const report = buildReport({
      pages: [page],
      origin: "https://example.com",
      geoRegistry,
      mode: "source",
      analyzedAt: "2026-11-13T00:00:00Z",
    });
    expect(report.pages[0].classification).toBe("review-recommended");
  });

  it("classifies a page with a fail as blocking-findings", () => {
    const page = makePage({ title: "" });
    const report = buildReport({
      pages: [page],
      origin: "https://example.com",
      geoRegistry,
      mode: "source",
      analyzedAt: "2026-11-13T00:00:00Z",
    });
    expect(report.pages[0].classification).toBe("blocking-findings");
  });

  it("summarizes by classification and by type", () => {
    const pages = [
      makePage({ url: "/a", type: "tool" }),
      makePage({ url: "/b", type: "guide", title: "" }),
      makePage({ url: "/c", type: "category", title: "JSON" }),
    ];
    const report = buildReport({
      pages,
      origin: "https://example.com",
      geoRegistry,
      mode: "source",
      analyzedAt: "2026-11-13T00:00:00Z",
    });
    expect(report.summary.totalPages).toBe(3);
    expect(report.summary.byClassification["no-blocking-findings"]).toBe(1);
    expect(report.summary.byClassification["review-recommended"]).toBe(1);
    expect(report.summary.byClassification["blocking-findings"]).toBe(1);
    expect(report.summary.byType.tool).toBe(1);
    expect(report.summary.byType.guide).toBe(1);
    expect(report.summary.byType.category).toBe(1);
  });
});