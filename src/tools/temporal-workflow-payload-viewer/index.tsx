// src/tools/temporal-workflow-payload-viewer/index.tsx
import { useCallback, useId, useMemo, useRef, useState } from "react";
import {
  FILE_LIMIT_BYTES,
  PASTE_LIMIT_BYTES,
  buildInspectionReport,
  parsePayloadJson,
  type ParseResult,
  type ParsedPayload,
} from "./payload";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const TEXTAREA_CLASS = `mt-2 w-full resize-y rounded-md border border-input-border bg-input p-3 font-mono text-sm text-foreground ${FOCUS_RING}`;

const READONLY_TEXTAREA_CLASS = `mt-2 w-full resize-y rounded-md border border-input-border bg-surface-muted p-3 font-mono text-sm text-foreground ${FOCUS_RING}`;

const BUTTON_PRIMARY = `rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

const BUTTON_SECONDARY = `rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

export default function TemporalWorkflowPayloadViewer() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const dropZoneId = useId();
  const reportRef = useRef<HTMLTextAreaElement>(null);

  const reportJson = useMemo(
    () => (result ? buildInspectionReport(result) : ""),
    [result],
  );

  const hasResult = result !== null;
  const hasSuccess = result !== null && result.ok;
  const hasError = result !== null && result.ok === false;
  const isEmptyInput = input.trim().length === 0;

  const invalidate = useCallback(() => {
    setResult(null);
    setUiError(null);
    setCopied(false);
    setCopyFallback(false);
    setExpandedIndex(null);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    invalidate();
  }

  function handleAnalyze() {
    setLoading(true);
    setUiError(null);
    setCopied(false);
    setCopyFallback(false);
    try {
      setResult(parsePayloadJson(input));
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setInput("");
    invalidate();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const handleFile = useCallback(
    async (file: File) => {
      setUiError(null);
      invalidate();
      if (file.size === 0) {
        setUiError("The selected file is empty.");
        return;
      }
      if (file.size > FILE_LIMIT_BYTES) {
        setUiError(
          `The selected file is ${formatBytes(file.size)}, which exceeds the ${formatBytes(FILE_LIMIT_BYTES)} limit.`,
        );
        return;
      }
      setLoading(true);
      try {
const buffer = await file.arrayBuffer();
const text = new TextDecoder("utf-8").decode(buffer);
setInput(text);
setResult(parsePayloadJson(text));
      } catch (err) {
        setUiError(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    },
    [invalidate],
  );

  function handleFilePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(true);
  }
  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
  }

  async function handleCopy() {
    if (!reportJson) return;
    setCopied(false);
    setCopyFallback(false);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportJson);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
        return;
      }
      throw new Error("Clipboard API unavailable");
    } catch {
      if (reportRef.current) {
        reportRef.current.focus();
        reportRef.current.select();
      }
      setCopyFallback(true);
    }
  }

  function handleDownload() {
    if (!reportJson) return;
    const blob = new Blob([reportJson], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "temporal-payload-inspection.json";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const liveMessage = loading ? "Analyzing…" : hasSuccess ? "Inspection ready." : hasError ? "Inspection failed." : "";

  return (
    <div className="rounded-lg border border-border bg-surface" aria-busy={loading}>
      <p role="status" aria-live="polite" className="sr-only">{liveMessage}</p>

      <section className="border-b border-border p-4">
        <h2 className="text-base font-semibold text-foreground">Temporal Payload JSON</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste a Temporal <code className="font-mono">Payloads</code> JSON document, or upload a{" "}
          <code className="font-mono">.json</code> file. Input is limited to {formatBytes(PASTE_LIMIT_BYTES)} when pasting
          and {formatBytes(FILE_LIMIT_BYTES)} when uploading.
        </p>
        <label htmlFor="twpv-input" className="mt-3 block text-sm font-medium text-foreground">Payload JSON</label>
        <textarea
          id="twpv-input"
          value={input}
          onChange={handleInputChange}
          rows={12}
          spellCheck={false}
          placeholder={'{\n  "payloads": [\n    {\n      "metadata": { "encoding": "anNvbi9wbGFpbg==" },\n      "data": "eyJvcmRlcklkIjoiMTIzIn0="\n    }\n  ]\n}'}
          className={TEXTAREA_CLASS}
        />

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={fileInputId} className="block text-sm font-medium text-foreground">Upload a JSON file</label>
            <input
              id={fileInputId}
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFilePickerChange}
              className={`mt-1 block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary-hover ${FOCUS_RING}`}
            />
          </div>
          <div
            id={dropZoneId}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDragEnter={onDragOver}
            aria-label="Drop a .json file here"
            className={
              "flex flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-4 text-center transition-colors " +
              (dragActive ? "border-primary bg-surface-muted" : "border-border bg-surface-muted")
            }
          >
            <p className="text-sm text-foreground">Drop a .json file here</p>
          </div>
        </div>

        {uiError ? (
          <div role="alert" aria-live="assertive" className="mt-3 rounded-md border border-destructive bg-destructive-muted px-3 py-2 text-sm text-foreground">
            {uiError}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleAnalyze} disabled={isEmptyInput || loading} className={BUTTON_PRIMARY}>
            {loading ? "Analyzing…" : "Analyze"}
          </button>
          <button type="button" onClick={handleClear} disabled={!input && !hasResult && !uiError} className={`ml-auto ${BUTTON_SECONDARY}`}>
            Clear
          </button>
        </div>
      </section>

      {hasError && result && !result.ok ? (
        <section className="border-b border-border p-4">
          <div role="alert" aria-live="assertive" className="rounded-md border border-destructive bg-destructive-muted px-3 py-2 text-sm text-foreground">
            <p className="font-medium">Cannot inspect payload</p>
            <p className="mt-1">{result.error}</p>
          </div>
        </section>
      ) : null}

      {!hasResult && !uiError && !loading ? (
        <section className="p-4">
          <p className="text-sm text-muted-foreground">
            Paste or upload a Temporal Payload JSON document to inspect it. Nothing is uploaded, stored, or executed.
            Application-encrypted payloads are identified but are never decrypted by this tool.
          </p>
        </section>
      ) : null}

      {hasSuccess && result && result.ok ? (
        <>
          <section className="border-b border-border p-4">
            <h2 className="text-base font-semibold text-foreground">Summary</h2>
            <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              <dt className="text-muted-foreground">Payloads</dt>
              <dd className="font-mono">{result.payloads.length}</dd>
              <dt className="text-muted-foreground">Warnings</dt>
              <dd className="font-mono">
                {result.warnings.length + result.payloads.reduce((n, p) => n + p.warnings.length, 0)}
              </dd>
            </dl>
            {result.warnings.length > 0 ? (
              <ul className="mt-3 list-disc pl-5 text-xs text-muted-foreground">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            ) : null}
          </section>

          {result.payloads.length === 0 ? (
            <section className="border-b border-border p-4">
              <p className="text-sm text-muted-foreground">The document contains no payloads.</p>
            </section>
          ) : (
            <section className="border-b border-border p-4">
              <h2 className="text-base font-semibold text-foreground">Payloads</h2>
              <div className="mt-2 overflow-x-auto rounded-md border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Encoding</th>
                      <th className="px-3 py-2">Data bytes</th>
                      <th className="px-3 py-2">Decoded UTF-8</th>
                      <th className="px-3 py-2">Warnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.payloads.map((p) => (
                      <tr key={p.index} className="border-t border-border align-top">
                        <td className="px-3 py-2 font-mono text-xs">{p.index}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {p.encoding ?? <span className="text-muted-foreground">unknown</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {p.dataBytes === null ? "—" : `${p.dataBytes.length}`}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {p.dataUtf8 === null ? "—" : <span className="break-all">{p.dataUtf8}</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">{p.warnings.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {result.payloads.map((p) => (
                  <button
                    key={p.index}
                    type="button"
                    onClick={() => setExpandedIndex((cur) => (cur === p.index ? null : p.index))}
                    className={BUTTON_SECONDARY}
                    aria-expanded={expandedIndex === p.index}
                  >
                    {expandedIndex === p.index ? `Hide payload ${p.index}` : `Inspect payload ${p.index}`}
                  </button>
                ))}
              </div>
              {expandedIndex !== null && result.payloads[expandedIndex]
  ? <PayloadDetails payload={result.payloads[expandedIndex]!} />
  : null}
            </section>
          )}

          <section className="border-b border-border p-4">
            <h2 className="text-base font-semibold text-foreground">Inspection report (JSON)</h2>
            <label htmlFor="twpv-report" className="mt-2 block text-sm font-medium text-foreground">
              Downloadable report
            </label>
            <textarea
              id="twpv-report"
              ref={reportRef}
              value={reportJson}
              readOnly
              rows={12}
              spellCheck={false}
              className={READONLY_TEXTAREA_CLASS}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleCopy} className={BUTTON_SECONDARY}>Copy report</button>
              <button type="button" onClick={handleDownload} className={BUTTON_SECONDARY}>Download report</button>
              {copied || copyFallback ? (
                <p aria-live="polite" className="w-full text-sm text-foreground">
                  {copied
                    ? "Copied to clipboard."
                    : "Clipboard access was unavailable. The report has been selected — press Ctrl+C (Cmd+C on Mac) to copy."}
                </p>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      <div className="p-4 text-xs text-muted-foreground">
        Payloads are parsed and decoded entirely in your browser. Nothing is uploaded, stored, or transmitted. The tool
        does not execute payload contents and does not decrypt application-encrypted payloads — that requires the
        application's codec and keys.
      </div>
    </div>
  );
}

function PayloadDetails({ payload }: { payload: ParsedPayload }) {
  return (
    <div className="mt-3 space-y-3 rounded-md border border-border bg-surface-muted p-3 text-sm">
      <div>
        <p className="font-medium text-foreground">Payload {payload.index}</p>
        <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <dt className="text-muted-foreground">Decoded encoding</dt>
          <dd className="font-mono">{payload.encoding ?? "—"}</dd>
          <dt className="text-muted-foreground">Encoding (base64)</dt>
          <dd className="font-mono break-all">{payload.encodingBase64 ?? "—"}</dd>
          <dt className="text-muted-foreground">Data (base64 length)</dt>
          <dd className="font-mono">{payload.dataBase64.length}</dd>
          <dt className="text-muted-foreground">Data (bytes)</dt>
          <dd className="font-mono">{payload.dataBytes === null ? "—" : payload.dataBytes.length}</dd>
        </dl>
      </div>
      {payload.warnings.length > 0 ? (
        <ul className="list-disc pl-5 text-xs text-foreground">
          {payload.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      ) : null}
      <div>
        <label htmlFor={`twpv-data-${payload.index}`} className="block text-xs font-medium text-foreground">Raw data (base64)</label>
        <textarea
          id={`twpv-data-${payload.index}`}
          value={payload.dataBase64}
          readOnly
          rows={4}
          spellCheck={false}
          className={READONLY_TEXTAREA_CLASS}
        />
      </div>
      <div>
        <label htmlFor={`twpv-utf8-${payload.index}`} className="block text-xs font-medium text-foreground">Decoded text</label>
        <textarea
          id={`twpv-utf8-${payload.index}`}
          value={payload.dataUtf8 ?? ""}
          readOnly
          rows={4}
          spellCheck={false}
          placeholder={payload.dataUtf8 === null ? "Not decodable as UTF-8 (or no data)." : ""}
          className={READONLY_TEXTAREA_CLASS}
        />
      </div>
    </div>
  );
}