// src/tools/iso27001-control-mapping-checker/schema.ts

import type { ImportDiagnostic, PolicyRecord } from "./types";

export const LIMITS = Object.freeze({
  maxFileBytes: 5 * 1024 * 1024,
  maxRecords: 5_000,
  maxColumns: 50,
  maxCellLength: 10_000,
  maxWorksheets: 20,
});

export type LogicalField =
  | "policyId"
  | "policyName"
  | "policyDescription"
  | "owner"
  | "category"
  | "status"
  | "scope"
  | "evidenceRefs";

/** Column-name aliases. Matching is case-insensitive and punctuation-tolerant. */
const FIELD_ALIASES: Record<LogicalField, readonly string[]> = {
  policyId:          ["policy id", "policyid", "id", "policy identifier", "policy_id"],
  policyName:        ["policy name", "name", "title", "policy title", "policy_name"],
  policyDescription: ["description", "policy description", "summary", "content", "text", "policy_description"],
  owner:             ["owner", "policy owner", "responsible", "responsible party"],
  category:          ["category", "policy category", "type", "topic"],
  status:            ["status", "policy status", "implementation status", "state"],
  scope:             ["scope", "policy scope", "applies to", "applicability"],
  evidenceRefs:      ["evidence", "evidence reference", "evidence references", "document reference", "reference", "doc"],
};

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function guessFieldFromHeader(header: string): LogicalField | null {
  const n = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<[LogicalField, readonly string[]]>) {
    for (const alias of aliases) {
      if (n === alias) return field;
    }
  }
  return null;
}

/**
 * Given a list of raw header strings, produce a mapping from header index to
 * logical field. First match wins per logical field, and a header is never
 * assigned to two fields.
 */
export function detectColumnMapping(headers: string[]): Partial<Record<LogicalField, number>> {
  const result: Partial<Record<LogicalField, number>> = {};
  const assignedFields = new Set<LogicalField>();
  headers.forEach((h, idx) => {
    if (idx >= LIMITS.maxColumns) return;
    const field = guessFieldFromHeader(h);
    if (!field) return;
    if (assignedFields.has(field)) return;
    assignedFields.add(field);
    result[field] = idx;
  });
  return result;
}

export interface RawRow {
  /** 1-based source row number for diagnostics. */
  sourceRow: number;
  cells: string[];
  /** Indexes of cells that originated from formula cells in XLSX. */
  formulaCellIndexes?: number[];
}

export interface NormalizeResult {
  policies: PolicyRecord[];
  diagnostics: ImportDiagnostic[];
}

/**
 * Convert raw rows (already extracted from CSV or XLSX) into PolicyRecords.
 * Applies limits, required-field checks, length limits, duplicate-ID handling
 * and formula-cell warnings. Never throws; all problems are diagnostics.
 */
export function normalizeRows(
  rows: RawRow[],
  mapping: Partial<Record<LogicalField, number>>,
): NormalizeResult {
  const diagnostics: ImportDiagnostic[] = [];
  const policies: PolicyRecord[] = [];

  if (mapping.policyName === undefined) {
    diagnostics.push({ row: 0, message: "Missing required column: policy name.", severity: "error" });
  }
  if (mapping.policyDescription === undefined) {
    diagnostics.push({ row: 0, message: "Missing required column: policy description.", severity: "error" });
  }
  if (diagnostics.length > 0) {
    return { policies, diagnostics };
  }

  const seenIds = new Set<string>();
  let autoSeq = 0;
  let formulaRowCount = 0;

  for (const row of rows) {
    if (policies.length >= LIMITS.maxRecords) {
      diagnostics.push({
        row: row.sourceRow,
        message: `Record limit (${LIMITS.maxRecords}) reached; remaining rows were not imported.`,
        severity: "error",
      });
      break;
    }
    if (row.cells.length > LIMITS.maxColumns) {
      diagnostics.push({
        row: row.sourceRow,
        message: `Row has ${row.cells.length} columns; limit is ${LIMITS.maxColumns}.`,
        severity: "error",
      });
      continue;
    }

    // Trim and truncate cells per limit.
    const cells = row.cells.map((c, idx) => {
      if (c.length > LIMITS.maxCellLength) {
        diagnostics.push({
          row: row.sourceRow,
          column: String(idx),
          message: `Cell exceeds ${LIMITS.maxCellLength} characters and was truncated.`,
          severity: "warning",
        });
        return c.slice(0, LIMITS.maxCellLength);
      }
      return c;
    });

    const get = (field: LogicalField): string | undefined => {
      const idx = mapping[field];
      if (idx === undefined) return undefined;
      const v = cells[idx];
      if (v === undefined) return undefined;
      const t = v.trim();
      return t.length === 0 ? undefined : t;
    };

    const name = get("policyName");
    const description = get("policyDescription");
    if (!name || !description) {
      diagnostics.push({
        row: row.sourceRow,
        message: "Skipped: policy name or description is empty.",
        severity: "warning",
      });
      continue;
    }

    let policyId = get("policyId");
    if (!policyId) {
      autoSeq += 1;
      policyId = `imported-row-${row.sourceRow}-${autoSeq}`;
    }
    if (seenIds.has(policyId)) {
      diagnostics.push({
        row: row.sourceRow,
        message: `Duplicate policy ID "${policyId}" skipped.`,
        severity: "warning",
      });
      continue;
    }
    seenIds.add(policyId);

    const hadFormula = (row.formulaCellIndexes?.length ?? 0) > 0;
    if (hadFormula) formulaRowCount += 1;

    policies.push({
      policyId,
      policyName: name,
      policyDescription: description,
      owner: get("owner"),
      category: get("category"),
      status: get("status"),
      scope: get("scope"),
      evidenceRefs: get("evidenceRefs"),
      sourceRow: row.sourceRow,
      hadFormulaCells: hadFormula || undefined,
    });
  }

  if (formulaRowCount > 0) {
    diagnostics.push({
      row: 0,
      message: `${formulaRowCount} row(s) contained formula cells. Formula results are not used as policy evidence; affected cells were treated as plain text and flagged.`,
      severity: "warning",
    });
  }

  return { policies, diagnostics };
}
