import { useMemo, useRef, useState } from "react";
import {
  parseTracepointFormat,
  generateCode,
  validateCode,
  DEFAULT_EXAMPLE,
  type Diagnostic,
  type ParsedField,
  type ParseResult,
} from "./ebpf";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const TEXTAREA_CLASS = `mt-2 w-full resize-y rounded-md border border-input-border bg-input p-3 font-mono text-sm text-foreground ${FOCUS_RING}`;

const INPUT_CLASS = `mt-1 w-full rounded-md border border-input-border bg-input px-3 py-2 text-sm text-foreground ${FOCUS_RING}`;

interface DiagnosticsPanelProps {
  diagnostics: Diagnostic[];
}

function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  if (diagnostics.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted-foreground">
        No issues detected by static checks.
      </div>
    );
  }

  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const infos = diagnostics.filter((d) => d.severity === "info");

  return (
    <div className="space-y-3">
      {errors.length > 0 ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-destructive bg-destructive-muted px-3 py-2 text-sm text-foreground"
        >
          <p className="font-medium">Errors ({errors.length})</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((d, i) => (
              <li key={i}>
                {d.line !== undefined ? `line ${d.line}: ` : ""}
                {d.message} <span className="text-xs text-muted-foreground">[{d.code}]</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div aria-live="polite">
        {warnings.length > 0 ? (
          <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground">
            <p className="font-medium">Warnings ({warnings.length})</p>
            <ul className="mt-1 list-disc pl-5">
              {warnings.map((d, i) => (
                <li key={i}>
                  {d.line !== undefined ? `line ${d.line}: ` : ""}
                  {d.message} <span className="text-xs text-muted-foreground">[{d.code}]</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {infos.length > 0 ? (
          <div className="mt-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Informational ({infos.length})</p>
            <ul className="mt-1 list-disc pl-5">
              {infos.map((d, i) => (
                <li key={i}>{d.message}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface FieldTableProps {
  fields: ParsedField[];
  selected: Set<string>;
  onToggle: (name: string) => void;
}

function FieldTable({ fields, selected, onToggle }: FieldTableProps) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No fields parsed. Paste a tracepoint format file to see the field table.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Probe access</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Offset</th>
            <th className="px-3 py-2">Size</th>
            <th className="px-3 py-2">Signed</th>
            <th className="px-3 py-2">Kind</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
          const kind = f.isCommon
            ? "common"
            : f.isDataLoc
            ? "__data_loc"
            : f.isRelLoc
            ? "__rel_loc"
            : f.arrayLength !== null
            ? "array"
            : /\*/.test(f.type)
            ? "pointer"
            : "scalar";

            return (
              <tr key={f.name} className="border-t border-border">
                <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(f.name)}
                  onChange={() => onToggle(f.name)}
                  disabled={f.isCommon}
                  title={
                    f.isCommon
                      ? "Common tracepoint header field — included in the struct to preserve offsets, but not individually selectable."
                      : undefined
                  }
                  aria-label={`Select field ${f.name}`}
                  className={`${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-40`}
                />
                </td>
                <td className="px-3 py-2 font-mono text-xs">{f.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{f.type}</td>
                <td className="px-3 py-2 font-mono text-xs">{f.offset}</td>
                <td className="px-3 py-2 font-mono text-xs">{f.size}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {f.signed ? "yes" : "no"}
                </td>
                <td className="px-3 py-2 text-xs">{kind}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function EbpfTracepointSyntaxHelper() {
  const [category, setCategory] = useState("syscalls");
  const [event, setEvent] = useState("sys_enter_openat");
  const [programName, setProgramName] = useState("");
  const [structName, setStructName] = useState("");
  const [formatText, setFormatText] = useState(DEFAULT_EXAMPLE);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    new Set(["dfd", "filename", "flags", "mode"]),
  );
  const [customCode, setCustomCode] = useState("");
  const [editorText, setEditorText] = useState("");
  const [generatedOnce, setGeneratedOnce] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const parsed: ParseResult = useMemo(
    () => parseTracepointFormat(formatText),
    [formatText],
  );

  const effectiveStructName =
    structName.trim() || `trace_event_raw_${event || "event"}`;
  const effectiveProgramName =
    programName.trim() ||
    `tracepoint__${category || "category"}__${event || "event"}`;

  function toggleField(name: string) {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleGenerate() {
    const result = generateCode({
      category,
      event,
      programName: effectiveProgramName,
      contextStructName: effectiveStructName,
      parsedFields: parsed.fields,
      selectedFieldNames: Array.from(selectedFields),
      customCode,
    });
    if (!result.ok) {
      setDiagnostics([
        {
          severity: "error",
          message: result.warnings.join(" "),
          code: "GEN-FAILED",
        },
      ]);
      return;
    }
    setEditorText(result.code);
    setGeneratedOnce(true);
    setDiagnostics(
      result.warnings.map((w) => ({
        severity: "warning" as const,
        message: w,
        code: "GEN-WARNING",
      })),
    );
  }

  function handleValidate() {
    const result = validateCode(editorText, {
      parsedFields: parsed.fields,
      selectedFieldNames: Array.from(selectedFields),
      structName: effectiveStructName,
      programName: effectiveProgramName,
    });
    setDiagnostics(result.diagnostics);
  }

  function handleReset() {
    if (!generatedOnce) return;
    handleGenerate();
  }

  function handleClear() {
    setCategory("syscalls");
    setEvent("sys_enter_openat");
    setProgramName("");
    setStructName("");
    setFormatText("");
    setSelectedFields(new Set());
    setCustomCode("");
    setEditorText("");
    setGeneratedOnce(false);
    setDiagnostics([]);
    setCopied(false);
    setCopyFallback(false);
  }

  async function handleCopy() {
    if (!editorText) return;
    setCopied(false);
    setCopyFallback(false);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(editorText);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
        return;
      }
      throw new Error("Clipboard API unavailable");
    } catch {
      if (editorRef.current) {
        editorRef.current.focus();
        editorRef.current.select();
      }
      setCopyFallback(true);
    }
  }

  function handleDownload() {
    if (!editorText) return;
    const blob = new Blob([editorText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${effectiveProgramName || "tracepoint"}.c`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      {/* Configuration */}
      <div className="border-b border-border p-4">
        <h2 className="text-base font-semibold text-foreground">
          Tracepoint configuration
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="tp-category" className="block text-sm font-medium text-foreground">
              Category
            </label>
            <input
              id="tp-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="syscalls"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="tp-event" className="block text-sm font-medium text-foreground">
              Event
            </label>
            <input
              id="tp-event"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              placeholder="sys_enter_openat"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="tp-program" className="block text-sm font-medium text-foreground">
              Program name (optional)
            </label>
            <input
              id="tp-program"
              value={programName}
              onChange={(e) => setProgramName(e.target.value)}
              placeholder={effectiveProgramName}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="tp-struct" className="block text-sm font-medium text-foreground">
              Context struct name (optional)
            </label>
            <input
              id="tp-struct"
              value={structName}
              onChange={(e) => setStructName(e.target.value)}
              placeholder={effectiveStructName}
              className={INPUT_CLASS}
            />
          </div>
        </div>
      </div>

      {/* Format file input */}
      <div className="border-b border-border p-4">
        <label htmlFor="tp-format" className="block text-sm font-medium text-foreground">
          Linux tracepoint format file (optional)
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Found on a Linux system at{" "}
          <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">
            /sys/kernel/debug/tracing/events/&lt;category&gt;/&lt;event&gt;/format
          </code>
          . Paste the contents to generate field access.
        </p>
        <textarea
          id="tp-format"
          value={formatText}
          onChange={(e) => setFormatText(e.target.value)}
          rows={8}
          spellCheck={false}
          className={TEXTAREA_CLASS}
          placeholder="Paste the tracepoint format file contents here"
        />
        {parsed.errors.length > 0 ? (
          <div
            role="alert"
            aria-live="assertive"
            className="mt-2 rounded-md border border-destructive bg-destructive-muted px-3 py-2 text-sm text-foreground"
          >
            <p className="font-medium">Format parse errors</p>
            <ul className="mt-1 list-disc pl-5">
              {parsed.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            {parsed.fields.length} field(s) parsed
            {parsed.name ? ` from tracepoint ${parsed.name}` : ""}.
          </p>
        )}
      </div>

      {/* Field table */}
      <div className="border-b border-border p-4">
        <h2 className="text-base font-semibold text-foreground">Fields</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          All parsed fields are emitted in the context structure to preserve
          tracepoint offsets. Checking a field only adds a field-access example
          in the probe body.
        </p>
        <div className="mt-3">
          <FieldTable
            fields={parsed.fields}
            selected={selectedFields}
            onToggle={toggleField}
          />
        </div>
      </div>

      {/* Custom C code */}
      <div className="border-b border-border p-4">
        <label htmlFor="tp-custom" className="block text-sm font-medium text-foreground">
          Custom C code (optional)
        </label>
        <textarea
          id="tp-custom"
          value={customCode}
          onChange={(e) => setCustomCode(e.target.value)}
          rows={3}
          spellCheck={false}
          className={TEXTAREA_CLASS}
          placeholder="Insert custom statements into the probe body"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
        <button
          type="button"
          onClick={handleGenerate}
          className={`rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover ${FOCUS_RING}`}
        >
          Generate code
        </button>
        <button
          type="button"
          onClick={handleValidate}
          disabled={!generatedOnce}
          className={`rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
        >
          Validate code
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={!generatedOnce}
          className={`rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
        >
          Reset to generated
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!editorText}
          className={`rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
        >
          Copy
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!editorText}
          className={`rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
        >
          Download .c
        </button>
        <button
          type="button"
          onClick={handleClear}
          className={`ml-auto rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted ${FOCUS_RING}`}
        >
          Clear
        </button>
        {copied || copyFallback ? (
          <p aria-live="polite" className="w-full text-sm text-foreground">
            {copied
              ? "Copied to clipboard."
              : "Clipboard access was unavailable. The code has been selected — press Ctrl+C (Cmd+C on Mac) to copy."}
          </p>
        ) : null}
      </div>

      {/* Editor */}
      <div className="border-b border-border p-4">
        <label htmlFor="tp-editor" className="block text-sm font-medium text-foreground">
          Generated C code
        </label>
        <textarea
          id="tp-editor"
          ref={editorRef}
          value={editorText}
          onChange={(e) => setEditorText(e.target.value)}
          rows={18}
          spellCheck={false}
          className={TEXTAREA_CLASS}
          placeholder="Click Generate code to create the initial source"
        />
      </div>

      {/* Diagnostics */}
      <div className="p-4">
        <h2 className="text-base font-semibold text-foreground">Diagnostics</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Static checks only. This tool does not invoke clang or the kernel
          verifier, and does not guarantee that the generated program will
          compile, pass the verifier, or run.
        </p>
        <div className="mt-3">
          <DiagnosticsPanel diagnostics={diagnostics} />
        </div>
      </div>
    </div>
  );
}