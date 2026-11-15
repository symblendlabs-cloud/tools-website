// src/tools/wasm-memory-layout-visualizer/index.tsx

import { useCallback, useId, useRef, useState } from "react";
import {
  parseWasmModule,
  type Diagnostic as ParserDiagnostic,
  type ParsedModule,
} from "./wasm-parser";
import {
  analyzeModuleWithDiagnostics,
  type AnalysisWarning,
  type MemoryAnalysisReport,
  type SerializedInt,
} from "./analyzer";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum file size the component will accept, in bytes (16 MiB). */
const MAX_FILE_BYTES = 16 * 1024 * 1024;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const BUTTON_PRIMARY = `rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

const BUTTON_SECONDARY = `rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function formatInt(si: SerializedInt): string {
  return `${si.decimal} (${si.hex})`;
}

function formatIntOrDash(si: SerializedInt | null): string {
  return si === null ? "\u2014" : formatInt(si);
}

// ---------------------------------------------------------------------------
// UI subcomponents
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

function Section({ title, description, children }: SectionProps) {
  const headingId = useId();
  return (
    <section
      className="border-b border-border p-4 last:border-b-0"
      aria-labelledby={headingId}
    >
      <h2
        id={headingId}
        className="text-base font-semibold text-foreground"
      >
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

interface DiagnosticListProps {
  diagnostics: ParserDiagnostic[];
}

function ParserDiagnosticsPanel({ diagnostics }: DiagnosticListProps) {
  if (diagnostics.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No parser diagnostics reported.
      </p>
    );
  }
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const unsupported = diagnostics.filter((d) => d.severity === "unsupported");

  return (
    <div className="space-y-3">
      {errors.length > 0 ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-destructive bg-destructive-muted px-3 py-2 text-sm text-foreground"
        >
          <p className="font-medium">Parser errors ({errors.length})</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((d, i) => (
              <li key={i}>
                offset {d.offset}: {d.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground">
          <p className="font-medium">Parser warnings ({warnings.length})</p>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((d, i) => (
              <li key={i}>
                offset {d.offset}: {d.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {unsupported.length > 0 ? (
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            Unsupported features ({unsupported.length})
          </p>
          <ul className="mt-1 list-disc pl-5">
            {unsupported.map((d, i) => (
              <li key={i}>
                offset {d.offset}: {d.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

interface AnalyzerWarningsPanelProps {
  warnings: AnalysisWarning[];
}

function AnalyzerWarningsPanel({ warnings }: AnalyzerWarningsPanelProps) {
  if (warnings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No analyzer warnings reported.
      </p>
    );
  }
  const errors = warnings.filter((w) => w.severity === "error");
  const warns = warnings.filter((w) => w.severity === "warning");
  const infos = warnings.filter((w) => w.severity === "info");

  return (
    <div className="space-y-3">
      {errors.length > 0 ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-destructive bg-destructive-muted px-3 py-2 text-sm text-foreground"
        >
          <p className="font-medium">Analyzer errors ({errors.length})</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {warns.length > 0 ? (
        <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground">
          <p className="font-medium">Analyzer warnings ({warns.length})</p>
          <ul className="mt-1 list-disc pl-5">
            {warns.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {infos.length > 0 ? (
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            Analyzer notes ({infos.length})
          </p>
          <ul className="mt-1 list-disc pl-5">
            {infos.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface FileState {
  name: string;
  size: number;
  bytes: Uint8Array;
}

interface AnalysisState {
  file: FileState;
  parsed: ParsedModule;
  report: MemoryAnalysisReport;
}

export default function WasmMemoryLayoutVisualizer() {
  const [fileState, setFileState] = useState<FileState | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const [parseErrors, setParseErrors] = useState<ParserDiagnostic[] | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<
    number | null
  >(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const dropZoneId = useId();

  const resetAll = useCallback(() => {
    setFileState(null);
    setAnalysis(null);
    setParseErrors(null);
    setUiError(null);
    setLoading(false);
    setDragActive(false);
    setSelectedSegmentIndex(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setUiError(null);
      setParseErrors(null);
      setAnalysis(null);
      setSelectedSegmentIndex(null);

      if (file.size === 0) {
        setUiError("The selected file is empty.");
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setUiError(
          `The selected file is ${formatBytes(file.size)}, which exceeds the ${formatBytes(
            MAX_FILE_BYTES,
          )} limit. Please choose a smaller module.`,
        );
        return;
      }

      setLoading(true);
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const parseResult = parseWasmModule(bytes);

        if (!parseResult.ok || !parseResult.module) {
          setFileState({ name: file.name, size: file.size, bytes });
          setParseErrors(parseResult.diagnostics);
          return;
        }

        const report = analyzeModuleWithDiagnostics(
          parseResult.module,
          parseResult.diagnostics,
        );
        setFileState({ name: file.name, size: file.size, bytes });
        setAnalysis({
          file: { name: file.name, size: file.size, bytes },
          parsed: parseResult.module,
          report,
        });
      } catch (err) {
        setUiError(
          `Failed to read file: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const onFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
  }, []);

  const handleExport = useCallback(() => {
    if (!analysis) return;
    const json = JSON.stringify(analysis.report, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "wasm-memory-report.json";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [analysis]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="rounded-lg border border-border bg-surface">
      {/* File input */}
      <Section
        title="Load a WebAssembly module"
        description={`Accepted: .wasm files up to ${formatBytes(
          MAX_FILE_BYTES,
        )}. The file is parsed in your browser and is never uploaded or executed.`}
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <div
            id={dropZoneId}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDragEnter={onDragOver}
            className={
              "flex flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors " +
              (dragActive
                ? "border-primary bg-surface-muted"
                : "border-border bg-surface-muted")
            }
            aria-label="Drop a .wasm file here, or use the file picker"
          >
            <p className="text-sm text-foreground">
              Drop a <code className="font-mono">.wasm</code> file here
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              or select one with the picker below
            </p>
          </div>
          <div className="flex flex-col justify-center gap-2">
            <label
              htmlFor={fileInputId}
              className="block text-sm font-medium text-foreground"
            >
              Select a .wasm file
            </label>
            <input
              id={fileInputId}
              ref={fileInputRef}
              type="file"
              accept=".wasm,application/wasm"
              onChange={onFileInputChange}
              className={`block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary-hover ${FOCUS_RING}`}
            />
            {fileState ? (
              <p className="text-xs text-muted-foreground">
                Loaded: {fileState.name} ({formatBytes(fileState.size)})
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No file selected.</p>
            )}
          </div>
        </div>

        {uiError ? (
          <div
            role="alert"
            aria-live="assertive"
            className="mt-3 rounded-md border border-destructive bg-destructive-muted px-3 py-2 text-sm text-foreground"
          >
            {uiError}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={!analysis}
            className={BUTTON_SECONDARY}
          >
            Export report as JSON
          </button>
          <button
            type="button"
            onClick={resetAll}
            disabled={!fileState && !analysis && !uiError && !parseErrors}
            className={BUTTON_SECONDARY}
          >
            Clear
          </button>
          {loading ? (
            <span aria-live="polite" className="text-sm text-muted-foreground">
              Reading and analyzing…
            </span>
          ) : null}
        </div>
      </Section>

      {/* Empty state */}
      {!fileState && !analysis && !parseErrors && !uiError && !loading ? (
        <Section title="Result">
          <p
            data-testid="empty-state-message"
            className="text-sm text-muted-foreground"
          >
            Load a <code className="font-mono">.wasm</code> file to see its
            memory layout. Nothing is uploaded; all parsing happens in your
            browser and the module is never executed.
          </p>
        </Section>
      ) : null}

      {/* Parse error state */}
      {parseErrors && parseErrors.length > 0 ? (
        <Section title="Parse result">
          <ParserDiagnosticsPanel diagnostics={parseErrors} />
        </Section>
      ) : null}

      {/* Analysis result */}
      {analysis ? (
        <>
          <Section title="Module overview">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              <OverviewRow label="File" value={analysis.file.name} />
              <OverviewRow
                label="File size"
                value={formatBytes(analysis.file.size)}
              />
              <OverviewRow
                label="WASM version"
                value={String(analysis.report.module.version)}
              />
              <OverviewRow
                label="Sections"
                value={String(analysis.report.module.sectionCount)}
              />
              <OverviewRow
                label="Memories"
                value={String(analysis.report.module.memoryCount)}
              />
              <OverviewRow
                label="Data segments"
                value={String(analysis.report.module.dataSegmentCount)}
              />
              <OverviewRow
                label="Exports"
                value={String(analysis.report.module.exportCount)}
              />
              <OverviewRow
                label="Globals"
                value={String(analysis.report.module.globalCount)}
              />
              <OverviewRow
                label="Imports"
                value={String(analysis.report.module.importCount)}
              />
            </dl>
          </Section>

          <Section
            title="Memory overview"
            description="Declared limits only. Runtime memory size is not available from static parsing."
          >
            {analysis.report.memories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No memories are declared in this module.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <Th>Index</Th>
                      <Th>Kind</Th>
                      <Th>Address</Th>
                      <Th>Shared</Th>
                      <Th>Initial pages</Th>
                      <Th>Initial bytes</Th>
                      <Th>Max pages</Th>
                      <Th>Max bytes</Th>
                      <Th>Runtime size</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.report.memories.map((m) => (
                      <tr key={m.index} className="border-t border-border">
                        <Td>{m.index}</Td>
                        <Td>{m.imported ? "imported" : "defined"}</Td>
                        <Td>{m.memory64 ? "memory64" : "memory32"}</Td>
                        <Td>{m.shared ? "yes" : "no"}</Td>
                        <Td>{formatInt(m.initialPages)}</Td>
                        <Td>{formatInt(m.initialSizeBytes)}</Td>
                        <Td>{formatIntOrDash(m.maximumPages)}</Td>
                        <Td>{formatIntOrDash(m.maximumSizeBytes)}</Td>
                        <Td>unknown</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            title="Data segments"
            description="Active segments have a statically resolvable start address. Passive segments are placed at runtime by memory.init. Unclassified regions are not free memory."
          >
            {analysis.report.dataSegments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No data segments in this module.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <Th>Index</Th>
                        <Th>Mode</Th>
                        <Th>Memory</Th>
                        <Th>Length</Th>
                        <Th>Start</Th>
                        <Th>End</Th>
                        <Th>Bounds</Th>
                        <Th>Overlaps</Th>
                        <Th>Offset</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.report.dataSegments.map((s) => (
                        <tr
                          key={s.index}
                          className={
                            "border-t border-border cursor-pointer " +
                            (selectedSegmentIndex === s.index
                              ? "bg-surface-muted"
                              : "hover:bg-surface-muted")
                          }
                          onClick={() => setSelectedSegmentIndex(s.index)}
                        >
                          <Td>{s.index}</Td>
                          <Td>{s.mode}</Td>
                          <Td>{s.memoryIndex ?? "\u2014"}</Td>
                          <Td>{s.byteLength}</Td>
                          <Td>{formatIntOrDash(s.startAddress)}</Td>
                          <Td>{formatIntOrDash(s.endAddress)}</Td>
                          <Td>{s.boundsStatus}</Td>
                          <Td>
                            {s.overlapsWith.length === 0
                              ? "none"
                              : s.overlapsWith.join(", ")}
                          </Td>
                          <Td>{s.offsetExpression.kind}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {selectedSegmentIndex !== null ? (
                  <SegmentDetails
                    segment={
                      analysis.report.dataSegments.find(
                        (s) => s.index === selectedSegmentIndex,
                      ) ?? null
                    }
                  />
                ) : null}
              </div>
            )}
          </Section>

          <Section
            title="Globals, stack and heap metadata"
            description="Recognized symbols: __stack_pointer, __stack_low, __stack_high, __heap_base. Initial values come from static initializers; runtime values are not available from static parsing."
          >
            {analysis.report.globals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None of the recognized stack or heap metadata symbols were
                found in the module's exports or imports.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <Th>Name</Th>
                      <Th>Source</Th>
                      <Th>Global index</Th>
                      <Th>Static value</Th>
                      <Th>Mutability</Th>
                      <Th>Runtime value</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.report.globals.map((g, i) => (
                      <tr key={i} className="border-t border-border">
                        <Td>
                          <code className="font-mono">{g.name}</code>
                        </Td>
                        <Td>{g.source}</Td>
                        <Td>{g.globalIndex}</Td>
                        <Td>{formatIntOrDash(g.staticValue)}</Td>
                        <Td>
                          {g.mutability === null
                            ? "\u2014"
                            : g.mutability
                              ? "mutable"
                              : "immutable"}
                        </Td>
                        <Td>unknown</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {analysis.report.stack.notes.length > 0 ? (
              <ul className="mt-3 list-disc pl-5 text-xs text-muted-foreground">
                {analysis.report.stack.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : null}
          </Section>

          <Section
            title="Unclassified address ranges"
            description="Ranges of each memory not covered by any statically resolvable active data segment. These are not necessarily free; they may contain zero-initialized memory, runtime structures, or other contents."
          >
            {analysis.report.regions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No unclassified ranges within the declared initial size of any
                memory.
              </p>
            ) : (
              <div
                data-region-list="unclassified"
                className="overflow-x-auto rounded-md border border-border"
              >
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <Th>Memory</Th>
                      <Th>Start</Th>
                      <Th>End (exclusive)</Th>
                      <Th>Size</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.report.regions.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <Td>{r.memoryIndex}</Td>
                        <Td>{formatInt(r.startAddress)}</Td>
                        <Td>{formatInt(r.endAddressExclusive)}</Td>
                        <Td>{formatInt(r.sizeBytes)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            title="Parser diagnostics"
            description="Produced by the binary parser; kept separate from analyzer warnings."
          >
            <ParserDiagnosticsPanel
              diagnostics={analysis.report.parserDiagnostics}
            />
          </Section>

          <Section title="Analyzer warnings">
            <AnalyzerWarningsPanel warnings={analysis.report.warnings} />
          </Section>

          <Section title="Custom sections">
            {analysis.parsed.customSections.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No custom sections in this module.
              </p>
            ) : (
              <ul className="space-y-1 text-sm text-foreground">
                {analysis.parsed.customSections.map((c, i) => (
                  <li key={i}>
                    <code className="font-mono">{c.name}</code>{" "}
                    <span className="text-xs text-muted-foreground">
                      (offset {c.offset}, size {c.size} bytes)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-foreground sm:col-span-1">
        <code className="font-mono text-xs">{value}</code>
      </dd>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2 font-mono text-xs text-foreground">{children}</td>
  );
}

function SegmentDetails({
  segment,
}: {
  segment: import("./analyzer").SegmentAnalysis | null;
}) {
  if (!segment) {
    return null;
  }
  return (
    <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
      <p className="font-medium text-foreground">
        Segment {segment.index} details
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Mode</dt>
        <dd>{segment.mode}</dd>
        <dt className="text-muted-foreground">Memory</dt>
        <dd>{segment.memoryIndex ?? "\u2014"}</dd>
        <dt className="text-muted-foreground">Byte length</dt>
        <dd>{segment.byteLength}</dd>
        <dt className="text-muted-foreground">Start</dt>
        <dd>{formatIntOrDash(segment.startAddress)}</dd>
        <dt className="text-muted-foreground">End</dt>
        <dd>{formatIntOrDash(segment.endAddress)}</dd>
        <dt className="text-muted-foreground">Bounds status</dt>
        <dd>{segment.boundsStatus}</dd>
        <dt className="text-muted-foreground">Offset expression</dt>
        <dd>{segment.offsetExpression.kind}</dd>
        {segment.unresolvedReason ? (
          <>
            <dt className="text-muted-foreground">Unresolved reason</dt>
            <dd>{segment.unresolvedReason}</dd>
          </>
        ) : null}
        {segment.placementNote ? (
          <>
            <dt className="text-muted-foreground">Placement</dt>
            <dd>{segment.placementNote}</dd>
          </>
        ) : null}
        {segment.overlapsWith.length > 0 ? (
          <>
            <dt className="text-muted-foreground">Overlaps with</dt>
            <dd>{segment.overlapsWith.join(", ")}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}