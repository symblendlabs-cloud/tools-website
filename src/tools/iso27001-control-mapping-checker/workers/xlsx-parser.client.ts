// src/tools/iso27001-control-mapping-checker/workers/xlsx-parser.client.ts

import type {
  WorkerCellRow,
  WorkerFailure,
  WorkerRequest,
  WorkerResponse,
  WorkerSheetInfo,
  WorkerSuccess,
} from "./xlsx-parser.worker";

export type { WorkerCellRow, WorkerSheetInfo } from "./xlsx-parser.worker";

export interface SheetInfo {
  name: string;
  isEmpty: boolean;
}

export type ParseXlsxResult =
  | {
      ok: true;
      sheets: SheetInfo[];
      selectedSheet: string;
      rows: WorkerCellRow[];
    }
  | { ok: false; error: string };

export interface ParseOptions {
  sheetName?: string;
  /** Defaults to 15 seconds. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function newRequestId(): string {
  // Deterministic enough for correlation; avoids crypto dependency.
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function parseViaFallback(bytes: ArrayBuffer, sheetName?: string): Promise<ParseXlsxResult> {
  // jsdom / non-worker environments fall back to an inline dynamic import.
  // The same message contract is exercised through the same code path.
  const mod = await import("./xlsx-parser.worker");
  const req: WorkerRequest = { requestId: newRequestId(), bytes, sheetName };
  const response = mod.parseWorkbook(req);
  if (!response.ok) return { ok: false, error: response.error };
  return {
    ok: true,
    sheets: response.sheets,
    selectedSheet: response.selectedSheet,
    rows: response.rows,
  };
}

function supportsWorker(): boolean {
  return typeof Worker !== "undefined";
}

export async function parseXlsxInWorker(
  bytes: ArrayBuffer,
  options: ParseOptions = {},
): Promise<ParseXlsxResult> {
  if (!supportsWorker()) {
    return parseViaFallback(bytes, options.sheetName);
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requestId = newRequestId();
  const request: WorkerRequest = { requestId, bytes, sheetName: options.sheetName };

  return new Promise<ParseXlsxResult>((resolve) => {
    let settled = false;
    let worker: Worker | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function finalize(result: ParseXlsxResult) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (worker) {
        worker.terminate();
        worker = null;
      }
      resolve(result);
    }

    try {
      worker = new Worker(new URL("./xlsx-parser.worker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      resolve({
        ok: false,
        error: `Worker could not start: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    timer = setTimeout(() => {
      finalize({ ok: false, error: `XLSX parsing timed out after ${timeoutMs} ms.` });
    }, timeoutMs);

    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (!data || data.requestId !== requestId) return; // ignore stale
      if (data.ok) {
        const success = data as WorkerSuccess;
        finalize({
          ok: true,
          sheets: success.sheets,
          selectedSheet: success.selectedSheet,
          rows: success.rows,
        });
      } else {
        const failure = data as WorkerFailure;
        finalize({ ok: false, error: failure.error });
      }
    });

    worker.addEventListener("error", (event: ErrorEvent) => {
      finalize({ ok: false, error: `Worker error: ${event.message || "unknown"}` });
    });

    worker.postMessage(request, [bytes]);
  });
}
