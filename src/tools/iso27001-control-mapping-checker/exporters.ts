// src/tools/iso27001-control-mapping-checker/exporters.ts

import Papa from "papaparse";
import { ANNEX_A_CONTROLS, STANDARD_META } from "./annex-a-controls";
import type {
  AssessmentData,
  MappingEdge,
  PolicyRecord,
} from "./types";
import { deriveControlState } from "./applicability";
import { computeCoverage } from "./coverage";

// ---------------------------------------------------------------------------
// Formula-injection guard
// ---------------------------------------------------------------------------

/**
 * If a string begins with one of the spreadsheet formula prefixes (`=`, `+`,
 * `-`, `@`) — optionally preceded by whitespace or a control character — prefix
 * it with a single quote so spreadsheets treat it as text.
 */
export function guardFormula(value: string): string {
  if (value.length === 0) return value;
  const leading = value.replace(/^[\s\u0000-\u001F]*/, "");
  if (leading.length === 0) return value;
  const first = leading[0];
  if (first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r") {
    return "'" + value;
  }
  return value;
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

export function buildProjectJson(data: AssessmentData): string {
  const coverage = computeCoverage(data.applicability, data.mappings);
  return JSON.stringify(
    {
      standard: STANDARD_META,
      generatedAt: new Date().toISOString(),
      coverage,
      policies: data.policies,
      applicability: data.applicability,
      mappings: data.mappings,
      implementations: data.implementations,
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// Mapping CSV / XLSX rows
// ---------------------------------------------------------------------------

const MAPPING_HEADERS = [
  "policy_id",
  "policy_name",
  "policy_owner",
  "policy_status",
  "evidence_refs",
  "control_id",
  "control_label",
  "mapping_source",
  "review_status",
  "match_reason",
] as const;

function mappingRows(data: AssessmentData): string[][] {
  const policyById = new Map<string, PolicyRecord>(data.policies.map((p) => [p.policyId, p]));
  const rows: string[][] = [MAPPING_HEADERS.slice()];
  // Sort for determinism.
  const edges = [...data.mappings].sort((a, b) =>
    a.policyId === b.policyId ? a.controlId.localeCompare(b.controlId) : a.policyId.localeCompare(b.policyId),
  );
  for (const edge of edges) {
    const policy = policyById.get(edge.policyId);
    const control = ANNEX_A_CONTROLS.find((c) => c.id === edge.controlId);
    rows.push([
      guardFormula(edge.policyId),
      guardFormula(policy?.policyName ?? ""),
      guardFormula(policy?.owner ?? ""),
      guardFormula(policy?.status ?? ""),
      guardFormula(policy?.evidenceRefs ?? ""),
      guardFormula(edge.controlId),
      guardFormula(control?.label ?? ""),
      guardFormula(edge.source),
      guardFormula(edge.reviewStatus),
      guardFormula(edge.matchReason),
    ]);
  }
  return rows;
}

export function buildMappingCsv(data: AssessmentData): string {
  return Papa.unparse(mappingRows(data));
}

// ---------------------------------------------------------------------------
// SoA CSV / XLSX rows
// ---------------------------------------------------------------------------

const SOA_HEADERS = [
  "control_id",
  "theme",
  "control_label",
  "applicability",
  "justification",
  "derived_state",
  "accepted_policy_ids",
  "mapping_sources",
  "review_statuses",
  "match_reasons",
  "implementation_status",
  "evidence_refs",
] as const;

function soaRows(data: AssessmentData): string[][] {
  const rows: string[][] = [SOA_HEADERS.slice()];
  const edgesByControl = new Map<string, MappingEdge[]>();
  for (const e of data.mappings) {
    const list = edgesByControl.get(e.controlId) ?? [];
    list.push(e);
    edgesByControl.set(e.controlId, list);
  }

  for (const control of ANNEX_A_CONTROLS) {
    const decision = data.applicability[control.id];
    const impl = data.implementations[control.id];
    const edges = edgesByControl.get(control.id) ?? [];
    const acceptedPolicyIds = edges
      .filter((e) => e.reviewStatus === "accepted")
      .map((e) => e.policyId)
      .sort();
    const derived = deriveControlState(control.id, data.applicability, edges);
    // Aggregate per-edge review metadata, deterministic ordering.
    const sortedEdges = [...edges].sort((a, b) => {
      const aKey = `${a.policyId}::${a.controlId}::${a.source}`;
      const bKey = `${b.policyId}::${b.controlId}::${b.source}`;
      return aKey.localeCompare(bKey);
    });
    const mappingSources = sortedEdges.map((e) => `${e.policyId}:${e.source}`).join(";");
    const reviewStatuses = sortedEdges.map((e) => `${e.policyId}:${e.reviewStatus}`).join(";");
    const matchReasons = sortedEdges.map((e) => `${e.policyId}:${e.matchReason}`).join(";");
    rows.push([
      guardFormula(control.id),
      guardFormula(control.theme),
      guardFormula(control.label),
      guardFormula(decision?.state ?? "not_assessed"),
      guardFormula(decision?.justification ?? ""),
      guardFormula(derived),
      guardFormula(acceptedPolicyIds.join(";")),
      guardFormula(mappingSources),
      guardFormula(reviewStatuses),
      guardFormula(matchReasons),
      guardFormula(impl?.status ?? "not_assessed"),
      guardFormula(impl?.evidenceRefs ?? ""),
    ]);
  }
  return rows;
}

export function buildSoaCsv(data: AssessmentData): string {
  return Papa.unparse(soaRows(data));
}

// ---------------------------------------------------------------------------
// XLSX (lazy-loaded)
// ---------------------------------------------------------------------------

interface XlsxSheet {
  name: string;
  rows: string[][];
}

async function writeXlsx(sheets: XlsxSheet[]): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows, { cellDates: false });
    // Force every cell to be a string type and strip formula markers so
    // spreadsheets never interpret exported values as formulas.
    for (const addr of Object.keys(ws)) {
      if (addr.startsWith("!")) continue;
      const cell = (ws as Record<string, unknown>)[addr] as { t?: string; v?: unknown; f?: string } | undefined;
      if (!cell) continue;
      delete cell.f;
      if (cell.t === "n" && typeof cell.v === "string") cell.t = "s";
    }
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(buf);
}

export async function buildMappingXlsx(data: AssessmentData): Promise<Uint8Array> {
  const rows = mappingRows(data);
  return writeXlsx([{ name: "Mappings", rows }]);
}

export async function buildSoaXlsx(data: AssessmentData): Promise<Uint8Array> {
  const rows = soaRows(data);
  return writeXlsx([
    { name: "Statement of Applicability", rows },
    { name: "Standard", rows: [["standard", STANDARD_META.id], ["version", STANDARD_META.version], ["total_controls", String(STANDARD_META.totalControls)]] },
  ]);
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

export function downloadBlob(content: BlobPart, mime: string, filename: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const MIME = Object.freeze({
  json: "application/json;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
