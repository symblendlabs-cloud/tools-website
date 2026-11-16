// src/tools/iso27001-control-mapping-checker/__tests__/xlsx-worker.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { parseWorkbook, type WorkerRequest } from "../workers/xlsx-parser.worker";
import * as XLSX from "xlsx";

afterEach(() => {
  vi.restoreAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).Worker;
});

function buildXlsxBlob(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["policy name", "description"],
    ["Access Policy", "Defines access control."],
    ["Backup Policy", "Covers backup and restore."],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Policies");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return buf;
}

describe("parseWorkbook (pure)", () => {
  it("returns sheet list and selected first non-empty sheet", () => {
    const bytes = buildXlsxBlob();
    const req: WorkerRequest = { requestId: "r1", bytes };
    const res = parseWorkbook(req);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.requestId).toBe("r1");
    expect(res.sheets).toHaveLength(1);
    expect(res.sheets[0]!.name).toBe("Policies");
    expect(res.selectedSheet).toBe("Policies");
    expect(res.rows.length).toBe(3);
    expect(res.rows[1]!.cells[0]).toBe("Access Policy");
  });

  it("returns failure when the workbook reader throws", () => {
    // Deterministic: inject a reader stub that always throws. This isolates
    // the parser's error-handling contract from SheetJS's tolerance behavior
    // and from ESM namespace-mocking limitations.
    const req: WorkerRequest = { requestId: "r2", bytes: new Uint8Array([1, 2, 3, 4]).buffer };
    const res = parseWorkbook(req, () => {
      throw new Error("corrupt container");
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.requestId).toBe("r2");
      expect(res.error).toContain("corrupt container");
    }
  });

  it("selects the requested sheet name when given", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["policy name", "description"], ["A", "B"]]), "Sheet1");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["policy name", "description"], ["C", "D"]]), "Sheet2");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const res = parseWorkbook({ requestId: "r3", bytes: buf, sheetName: "Sheet2" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.selectedSheet).toBe("Sheet2");
    expect(res.rows[1]!.cells[0]).toBe("C");
  });
});

describe("xlsx-parser.client worker path", () => {
  it("uses worker when Worker is available, ignoring stale responses", async () => {
    const { parseXlsxInWorker } = await import("../workers/xlsx-parser.client");

    type Listener = (ev: { data: unknown } | ErrorEvent) => void;
    const listeners: { message: Listener[]; error: Listener[] } = { message: [], error: [] };

    class FakeWorker {
      static lastInstance: FakeWorker | null = null;
      terminated = false;
      constructor() {
        FakeWorker.lastInstance = this;
      }
      addEventListener(type: "message" | "error", fn: Listener) {
        listeners[type].push(fn);
      }
      postMessage(req: { requestId: string }) {
        // Emit one stale response first, then the correct one.
        queueMicrotask(() => {
          listeners.message.forEach((fn) =>
            fn({ data: { ok: false, requestId: "stale-id", error: "should be ignored" } }),
          );
          listeners.message.forEach((fn) =>
            fn({
              data: {
                ok: true,
                requestId: req.requestId,
                sheets: [{ name: "Policies", isEmpty: false }],
                selectedSheet: "Policies",
                rows: [{ cells: ["policy name", "description"], formulaCellIndexes: [] }],
              },
            }),
          );
        });
      }
      terminate() {
        this.terminated = true;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Worker = FakeWorker as unknown as typeof Worker;

    const result = await parseXlsxInWorker(new Uint8Array([1, 2]).buffer, { timeoutMs: 1000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selectedSheet).toBe("Policies");
    expect(FakeWorker.lastInstance?.terminated).toBe(true);
  });

  it("times out if the worker never responds", async () => {
    const { parseXlsxInWorker } = await import("../workers/xlsx-parser.client");
    class SilentWorker {
      addEventListener() {}
      postMessage() {}
      terminate() {}
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Worker = SilentWorker as unknown as typeof Worker;
    const result = await parseXlsxInWorker(new Uint8Array([1]).buffer, { timeoutMs: 30 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/timed out/i);
  });
});
