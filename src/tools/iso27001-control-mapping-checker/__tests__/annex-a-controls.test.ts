// src/tools/iso27001-control-mapping-checker/__tests__/annex-a-controls.test.ts
import { describe, it, expect } from "vitest";
import {
  ANNEX_A_CONTROLS,
  CONTROL_IDS,
  CONTROL_BY_ID,
  THEME_COUNTS,
  isKnownControlId,
} from "../annex-a-controls";
import { TOTAL_CONTROLS } from "../types";

describe("Annex A catalogue", () => {
  it("contains exactly 93 controls", () => {
    expect(ANNEX_A_CONTROLS.length).toBe(TOTAL_CONTROLS);
    expect(ANNEX_A_CONTROLS.length).toBe(93);
  });

  it("contains only unique IDs", () => {
    const ids = ANNEX_A_CONTROLS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has the expected theme counts", () => {
    expect(THEME_COUNTS.organizational).toBe(37);
    expect(THEME_COUNTS.people).toBe(8);
    expect(THEME_COUNTS.physical).toBe(14);
    expect(THEME_COUNTS.technological).toBe(34);
    expect(
      THEME_COUNTS.organizational + THEME_COUNTS.people + THEME_COUNTS.physical + THEME_COUNTS.technological,
    ).toBe(93);
  });

  it("includes the first and last ID of each theme", () => {
    for (const id of ["A.5.1", "A.5.37", "A.6.1", "A.6.8", "A.7.1", "A.7.14", "A.8.1", "A.8.34"]) {
      expect(CONTROL_IDS.has(id)).toBe(true);
    }
  });

  it("resolves every ID through CONTROL_BY_ID", () => {
    for (const c of ANNEX_A_CONTROLS) {
      const resolved = CONTROL_BY_ID.get(c.id);
      expect(resolved).toBe(c);
      expect(isKnownControlId(c.id)).toBe(true);
    }
  });

  it("does not accept unknown or malformed IDs", () => {
    expect(isKnownControlId("A.5.999")).toBe(false);
    expect(isKnownControlId("5.1")).toBe(false);
    expect(isKnownControlId("A.9.1")).toBe(false);
    expect(isKnownControlId("")).toBe(false);
  });

  it("every control has at least one keyword", () => {
    for (const c of ANNEX_A_CONTROLS) {
      expect(c.keywords.length).toBeGreaterThan(0);
    }
  });
});
