// src/tools/iso27001-control-mapping-checker/importers.ts

import Papa from "papaparse";
import {
  LIMITS,
  detectColumnMapping,
  normalizeRows,
  type LogicalField,
  type NormalizeResult,
  type RawRow,
} from "./schema";
import type { ImportDiagnostic } from "./types";
import { parseXlsxInWorker, type SheetInfo } from "./workers/xlsx-parser.client";
import { initialEdgesForPolicyWithDiagnostics } from "./mapper";

/**
 * Build the diagnostic list for invalid control-reference candidates
 * encountered in each imported policy. Emits one warning per (policy, invalid
 * ref) pair, deduplicated within each policy.
 */
function collectInvalidReferenceDiagnostics(
  policies: ReadonlyArray<{ policyId: string; policyName: string; policyDescription: string; owner?: string; category?: string; status?: string; scope?: string; evidenceRefs?: string; sourceRow?: number; hadFormulaCells?: boolean }>,
): ImportDiagnostic[] {
  const out: ImportDiagnostic[] = [];
  for (const p of policies) {
    const { invalidRefs } = initialEdgesForPolicyWithDiagnostics(p as never);
    for (const ref of invalidRefs) {
      out.push({
        row: p.sourceRow ?? 0,
        message: `Invalid Annex A reference "${ref}" in policy "${p.policyName}" was ignored.`,
        severity: "warning",
      });
    }
  }
  return out;
}

export interface ImportSuccess {
  ok: true;
  policies: NormalizeResult["policies"];
  diagnostics: ImportDiagnostic[];
  mapping: Partial<Record<LogicalField, number>>;
  /** Present only for XLSX imports. */
  sheets?: SheetInfo[];
  selectedSheet?: string;
}

export interface ImportFailure {
  ok: false;
  error: string;
  diagnostics?: ImportDiagnostic[];
}

export type ImportResult = ImportSuccess | ImportFailure;

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function importCsv(text: string): ImportResult {
  const sizeBytes = new TextEncoder().encode(text).length;
  if (sizeBytes > LIMITS.maxFileBytes) {
    return { ok: false, error: `CSV exceeds ${LIMITS.maxFileBytes} bytes.` };
  }

  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (parsed.errors.length > 0) {
    const diagnostics: ImportDiagnostic[] = parsed.errors.map((e) => ({
      row: (e.row ?? 0) + 1,
      message: e.message,
      severity: "error",
    }));
    return { ok: false, error: "CSV parsing failed.", diagnostics };
  }

  const data = parsed.data.filter((row) => row.some((c) => c.trim().length > 0));
  if (data.length === 0) {
    return { ok: false, error: "CSV file is empty." };
  }

  const headerRow = data[0];
  if (!headerRow) {
    return { ok: false, error: "CSV file is empty." };
  }

  const headers = headerRow.map((h) => String(h));
  if (headers.length > LIMITS.maxColumns) {
    return { ok: false, error: `CSV has ${headers.length} columns; limit is ${LIMITS.maxColumns}.` };
  }

  const mapping = detectColumnMapping(headers);
  const rows: RawRow[] = data.slice(1).map((cells, idx) => ({
    sourceRow: idx + 2,
    cells: cells.map((c) => String(c)),
  }));

  const normalized = normalizeRows(rows, mapping);
  const invalidRefDiagnostics = collectInvalidReferenceDiagnostics(normalized.policies);
  return {
    ok: true,
    policies: normalized.policies,
    diagnostics: [...normalized.diagnostics, ...invalidRefDiagnostics],
    mapping,
  };
}

// ---------------------------------------------------------------------------
// XLSX (parsed via worker client)
// ---------------------------------------------------------------------------

export interface XlsxImportOptions {
  /** If omitted, the first non-empty worksheet is used. */
  sheetName?: string;
}

export async function importXlsx(
  file: File | ArrayBuffer,
  options: XlsxImportOptions = {},
): Promise<ImportResult> {
  const bytes = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  if (bytes.byteLength > LIMITS.maxFileBytes) {
    return { ok: false, error: `XLSX exceeds ${LIMITS.maxFileBytes} bytes.` };
  }
  if (bytes.byteLength === 0) {
    return { ok: false, error: "XLSX file is empty." };
  }

  const result = await parseXlsxInWorker(bytes, { sheetName: options.sheetName });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  if (result.sheets.length > LIMITS.maxWorksheets) {
    return {
      ok: false,
      error: `Workbook has ${result.sheets.length} worksheets; limit is ${LIMITS.maxWorksheets}.`,
    };
  }

  const usedSheet = result.selectedSheet;
  const sheet = result.sheets.find((s) => s.name === usedSheet);
  if (!sheet || sheet.isEmpty) {
    return { ok: false, error: "Selected worksheet is empty." };
  }

  const headers = result.rows[0]?.cells.map((c) => String(c)) ?? [];
  if (headers.length > LIMITS.maxColumns) {
    return { ok: false, error: `Worksheet has ${headers.length} columns; limit is ${LIMITS.maxColumns}.` };
  }

  const mapping = detectColumnMapping(headers);
  const dataRows: RawRow[] = result.rows.slice(1).map((row, idx) => ({
    sourceRow: idx + 2,
    cells: row.cells.map((c) => String(c)),
    formulaCellIndexes: row.formulaCellIndexes,
  }));

  const normalized = normalizeRows(dataRows, mapping);
  const invalidRefDiagnostics = collectInvalidReferenceDiagnostics(normalized.policies);
  return {
    ok: true,
    policies: normalized.policies,
    diagnostics: [...normalized.diagnostics, ...invalidRefDiagnostics],
    mapping,
    sheets: result.sheets,
    selectedSheet: usedSheet,
  };
}

// ---------------------------------------------------------------------------
// Dispatch by extension
// ---------------------------------------------------------------------------

export async function importFile(
  file: File,
  options: XlsxImportOptions = {},
): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  if (file.size > LIMITS.maxFileBytes) {
    return {
      ok: false,
      error: `File is ${file.size} bytes; limit is ${LIMITS.maxFileBytes} bytes.`,
    };
  }
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    const text = await file.text();
    return importCsv(text);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return importXlsx(file, options);
  }
  return { ok: false, error: `Unsupported file type: ${file.name}` };
}
