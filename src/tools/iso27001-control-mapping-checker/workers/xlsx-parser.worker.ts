// src/tools/iso27001-control-mapping-checker/workers/xlsx-parser.worker.ts

import * as XLSX from "xlsx";

export interface WorkerRequest {
  requestId: string;
  bytes: ArrayBuffer;
  sheetName?: string;
}

export interface WorkerCellRow {
  cells: string[];
  formulaCellIndexes: number[];
}

export interface WorkerSheetInfo {
  name: string;
  isEmpty: boolean;
}

export interface WorkerSuccess {
  ok: true;
  requestId: string;
  sheets: WorkerSheetInfo[];
  selectedSheet: string;
  rows: WorkerCellRow[];
}

export interface WorkerFailure {
  ok: false;
  requestId: string;
  error: string;
}

export type WorkerResponse = WorkerSuccess | WorkerFailure;

type ReadWorkbook = (bytes: ArrayBuffer, options: XLSX.ParsingOptions) => XLSX.WorkBook;

const defaultReadWorkbook: ReadWorkbook = (bytes, options) => XLSX.read(bytes, options);

export function parseWorkbook(
  req: WorkerRequest,
  readWorkbook: ReadWorkbook = defaultReadWorkbook,
): WorkerResponse {
  try {
    const wb = readWorkbook(req.bytes, {
      type: "array",
      cellFormula: true,   // required: we detect formulas via cell.f
      cellHTML: false,
      cellStyles: false,
      cellDates: false,
      sheetStubs: false,
      dense: false,
    });

    const sheets: WorkerSheetInfo[] = wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      const ref = ws?.["!ref"];
      return { name, isEmpty: !ref };
    });

    const chosen =
      req.sheetName && sheets.some((s) => s.name === req.sheetName)
        ? req.sheetName
        : sheets.find((s) => !s.isEmpty)?.name;

    if (!chosen) {
      return { ok: false, requestId: req.requestId, error: "Workbook contains no non-empty worksheets." };
    }

    const ws = wb.Sheets[chosen];
    if (!ws) {
      return { ok: false, requestId: req.requestId, error: "Selected worksheet is empty." };
    }
    const ref = ws["!ref"];
    if (!ref) {
      return { ok: false, requestId: req.requestId, error: "Selected worksheet is empty." };
    }

    const range = XLSX.utils.decode_range(ref);
    const rows: WorkerCellRow[] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cells: string[] = [];
      const formulaCellIndexes: number[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = (ws as Record<string, XLSX.CellObject | undefined>)[addr];
        if (!cell) {
          cells.push("");
          continue;
        }
        if (cell.f) {
          formulaCellIndexes.push(c);
          // Do NOT treat cached value as policy evidence; represent as marker.
          cells.push("[formula]");
        } else {
          cells.push(cell.v == null ? "" : String(cell.v));
        }
      }
      rows.push({ cells, formulaCellIndexes });
    }

    return { ok: true, requestId: req.requestId, sheets, selectedSheet: chosen, rows };
  } catch (err) {
    return {
      ok: false,
      requestId: req.requestId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Vite worker entry: only register message handling when running as a worker.
// Structural typing avoids requiring the dedicated-worker lib in tsconfig.
interface WorkerScopeLike {
  postMessage: (msg: WorkerResponse) => void;
  addEventListener: (type: "message", listener: (event: MessageEvent<WorkerRequest>) => void) => void;
}

const workerScope: WorkerScopeLike | undefined =
  typeof self !== "undefined" && typeof (self as unknown as WorkerScopeLike).postMessage === "function"
    ? (self as unknown as WorkerScopeLike)
    : undefined;

if (workerScope) {
  workerScope.addEventListener("message", (event) => {
    const response = parseWorkbook(event.data);
    workerScope.postMessage(response);
  });
}
