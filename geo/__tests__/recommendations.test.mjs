import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const GEO_DIR = resolve(process.cwd(), "geo");
const RECS_PATH = resolve(GEO_DIR, "recommendations.json");
const SCHEMA_PATH = resolve(GEO_DIR, "recommendations.schema.json");

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function loadRecommendations() {
  return loadJson(RECS_PATH);
}

async function loadSchema() {
  return loadJson(SCHEMA_PATH);
}

function makeAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv;
}

async function walk(dir, results = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, results);
    } else {
      results.push(full);
    }
  }
  return results;
}

describe("GEO JSON Schema validation (AJV)", () => {
  it("recommendations.json is valid against recommendations.schema.json", async () => {
    const schema = await loadSchema();
    const data = await loadRecommendations();
    const ajv = makeAjv();
    const validate = ajv.compile(schema);
    const valid = validate(data);
    if (!valid) {
      throw new Error(
        `Schema validation failed:\n${ajv.errorsText(validate.errors)}`,
      );
    }
    expect(valid).toBe(true);
  });

  it("rejects a recommendation missing a required field", async () => {
    const schema = await loadSchema();
    const data = await loadRecommendations();
    delete data.platforms[0].recommendations[0].claim;
    const ajv = makeAjv();
    const validate = ajv.compile(schema);
    expect(validate(data)).toBe(false);
  });

  it("rejects a non-HTTPS source URL", async () => {
    const schema = await loadSchema();
    const data = await loadRecommendations();
    data.platforms[0].recommendations[0].sources[0].url = "http://example.com";
    const ajv = makeAjv();
    const validate = ajv.compile(schema);
    expect(validate(data)).toBe(false);
  });

  it("rejects an invalid evidence classification", async () => {
    const schema = await loadSchema();
    const data = await loadRecommendations();
    data.platforms[0].evidence = "definitely-true";
    const ajv = makeAjv();
    const validate = ajv.compile(schema);
    expect(validate(data)).toBe(false);
  });

  it("rejects an invalid implementation value", async () => {
    const schema = await loadSchema();
    const data = await loadRecommendations();
    data.platforms[0].recommendations[0].implementation = "do-everything";
    const ajv = makeAjv();
    const validate = ajv.compile(schema);
    expect(validate(data)).toBe(false);
  });

  it("rejects an unexpected additional property", async () => {
    const schema = await loadSchema();
    const data = await loadRecommendations();
    data.platforms[0].unexpectedField = "surprise";
    const ajv = makeAjv();
    const validate = ajv.compile(schema);
    expect(validate(data)).toBe(false);
  });

  it("rejects an invalid lastReviewed date", async () => {
    const schema = await loadSchema();
    const data = await loadRecommendations();
    data.lastReviewed = "November 2026";
    const ajv = makeAjv();
    const validate = ajv.compile(schema);
    expect(validate(data)).toBe(false);
  });

  it("rejects a source with an invalid accessed date", async () => {
    const schema = await loadSchema();
    const data = await loadRecommendations();
    data.platforms[0].recommendations[0].sources[0].accessed = "2026/11/13";
    const ajv = makeAjv();
    const validate = ajv.compile(schema);
    expect(validate(data)).toBe(false);
  });

  it("rejects a source missing the type field", async () => {
    const schema = await loadSchema();
    const data = await loadRecommendations();
    delete data.platforms[0].recommendations[0].sources[0].type;
    const ajv = makeAjv();
    const validate = ajv.compile(schema);
    expect(validate(data)).toBe(false);
  });
});

describe("GEO JSON data invariants (not enforceable by JSON Schema)", () => {
  it("has unique platform IDs", async () => {
    const data = await loadRecommendations();
    const ids = data.platforms.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique recommendation IDs within each platform", async () => {
    const data = await loadRecommendations();
    for (const platform of data.platforms) {
      const ids = platform.recommendations.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("has exactly 10 platforms", async () => {
    const data = await loadRecommendations();
    expect(data.platforms).toHaveLength(10);
  });

  it("every already-covered-by-seo recommendation has implementation: none", async () => {
    const data = await loadRecommendations();
    for (const platform of data.platforms) {
      for (const rec of platform.recommendations) {
        if (rec.status === "already-covered-by-seo") {
          expect(rec.implementation).toBe("none");
        }
      }
    }
  });

  it("every experimental platform has only experimental or none statuses", async () => {
    const data = await loadRecommendations();
    for (const platform of data.platforms) {
      if (platform.evidence === "experimental") {
        for (const rec of platform.recommendations) {
          expect(["experimental", "none"]).toContain(rec.status);
        }
      }
    }
  });

  it("every source has valid provenance (first-party or third-party)", async () => {
    const data = await loadRecommendations();
    for (const platform of data.platforms) {
      for (const rec of platform.recommendations) {
        for (const source of rec.sources) {
          expect(["first-party", "third-party"]).toContain(source.type);
        }
      }
    }
  });

  it("platforms with only third-party sources are not classified as established", async () => {
    const data = await loadRecommendations();
    for (const platform of data.platforms) {
      const allSources = platform.recommendations.flatMap((r) => r.sources);
      const hasFirstParty = allSources.some((s) => s.type === "first-party");
      if (!hasFirstParty && platform.evidence === "established") {
        throw new Error(
          `Platform "${platform.id}" is marked established but has no first-party source.`,
        );
      }
    }
  });

  it("does not contain placeholder citations anywhere in geo/", async () => {
    const files = await walk(GEO_DIR);
    for (const file of files) {
      if (!/\.(json|md|mjs)$/.test(file)) continue;
      const content = await readFile(file, "utf8");
      expect(content).not.toMatch(/\[citation:\d+\]/);
    }
  });
});