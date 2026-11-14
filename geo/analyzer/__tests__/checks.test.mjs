import { describe, it, expect } from "vitest";
import { A1, B3, F1, F2, I1 } from "../checks.mjs";

describe("A1 — title and description", () => {
  it("passes when title and description are reasonable", () => {
    const result = A1.evaluate({
      title: "JSON ↔ YAML Converter",
      description:
        "Convert between JSON and YAML formats instantly in your browser without uploading any data.",
    });
    expect(result.status).toBe("pass");
  });

  it("fails when title is missing", () => {
    const result = A1.evaluate({ title: "", description: "x".repeat(100) });
    expect(result.status).toBe("fail");
  });

  it("fails when description is missing", () => {
    const result = A1.evaluate({ title: "x".repeat(20), description: "" });
    expect(result.status).toBe("fail");
  });

  it("warns when title is too short", () => {
    const result = A1.evaluate({
      title: "JSON",
      description: "x".repeat(100),
    });
    expect(result.status).toBe("warning");
    expect(result.manualReview).toBe(true);
  });

  it("warns when description is too long", () => {
    const result = A1.evaluate({
      title: "x".repeat(20),
      description: "x".repeat(300),
    });
    expect(result.status).toBe("warning");
  });
});

describe("B3 — duplicate descriptions", () => {
  it("passes when all descriptions are unique", () => {
    const pages = [
      { url: "/a", description: "aaa" },
      { url: "/b", description: "bbb" },
    ];
    const results = B3.evaluateAll(pages);
    expect(results.get("/a").status).toBe("pass");
    expect(results.get("/b").status).toBe("pass");
  });

  it("warns when two pages share a description", () => {
    const pages = [
      { url: "/a", description: "same" },
      { url: "/b", description: "same" },
    ];
    const results = B3.evaluateAll(pages);
    expect(results.get("/a").status).toBe("warning");
    expect(results.get("/b").status).toBe("warning");
  });

  it("ignores empty descriptions", () => {
    const pages = [
      { url: "/a", description: "" },
      { url: "/b", description: "" },
    ];
    const results = B3.evaluateAll(pages);
    expect(results.get("/a").status).toBe("pass");
    expect(results.get("/b").status).toBe("pass");
  });
});

describe("F1 — FAQ availability", () => {
  it("is informational when FAQs exist", () => {
    const result = F1.evaluate({
      type: "tool",
      faqs: [{ id: "a", answer: "x" }],
    });
    expect(result.status).toBe("informational");
  });

  it("is informational when FAQs are absent", () => {
    const result = F1.evaluate({ type: "tool", faqs: [] });
    expect(result.status).toBe("informational");
  });

  it("is not-applicable for guides", () => {
    const result = F1.evaluate({ type: "guide" });
    expect(result.status).toBe("not-applicable");
  });
});

describe("F2 — FAQ answer lengths", () => {
  it("passes when all answers are long", () => {
    const long = "word ".repeat(50).trim();
    const result = F2.evaluate({
      type: "tool",
      faqs: [{ id: "a", answer: long }],
    });
    expect(result.status).toBe("pass");
  });

  it("warns when an answer is short", () => {
    const result = F2.evaluate({
      type: "tool",
      faqs: [{ id: "a", answer: "Short answer." }],
    });
    expect(result.status).toBe("warning");
  });

  it("is not-applicable when no FAQs", () => {
    const result = F2.evaluate({ type: "tool", faqs: [] });
    expect(result.status).toBe("not-applicable");
  });
});

describe("I1 — dates", () => {
  it("is not-applicable when no date is exposed", () => {
    const result = I1.evaluate({ type: "guide" });
    expect(result.status).toBe("not-applicable");
  });

  it("is informational when a date is present", () => {
    const result = I1.evaluate({ type: "guide", datePublished: "2026-01-01" });
    expect(result.status).toBe("informational");
  });
});