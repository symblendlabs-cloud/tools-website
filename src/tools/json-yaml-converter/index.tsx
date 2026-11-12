import { useRef, useState } from "react";
import { convert, type Direction, type ConversionResult } from "./conversion";

const DIRECTION_LABELS: Record<Direction, string> = {
  "json-to-yaml": "JSON → YAML",
  "yaml-to-json": "YAML → JSON",
};

const INPUT_LABELS: Record<Direction, string> = {
  "json-to-yaml": "JSON input",
  "yaml-to-json": "YAML input",
};

const OUTPUT_LABELS: Record<Direction, string> = {
  "json-to-yaml": "YAML output",
  "yaml-to-json": "JSON output",
};

export default function JsonYamlConverter() {
  const [direction, setDirection] = useState<Direction>("json-to-yaml");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const outputRef = useRef<HTMLTextAreaElement>(null);

  function invalidateStaleResults() {
    setOutput("");
    setError(null);
    setCopied(false);
    setCopyFallback(false);
  }

  function handleInputChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value);
    invalidateStaleResults();
  }

  function handleDirectionChange(next: Direction) {
    if (next === direction) return;
    setDirection(next);
    invalidateStaleResults();
  }

  function handleConvert() {
    setCopied(false);
    setCopyFallback(false);
    const result: ConversionResult = convert(direction, input);
    if (result.ok) {
      setOutput(result.output);
      setError(null);
    } else {
      setOutput("");
      setError(result.error);
    }
  }

  function handleClear() {
    setInput("");
    setOutput("");
    setError(null);
    setCopied(false);
    setCopyFallback(false);
  }

  function handleSwap() {
    if (!output) return;
    const nextDirection: Direction =
      direction === "json-to-yaml" ? "yaml-to-json" : "json-to-yaml";
    setInput(output);
    setOutput("");
    setDirection(nextDirection);
    setError(null);
    setCopied(false);
    setCopyFallback(false);
  }

  async function handleCopy() {
    if (!output) return;
    setCopied(false);
    setCopyFallback(false);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(output);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
        return;
      }
      throw new Error("Clipboard API unavailable");
    } catch {
      // Fallback: select the output textarea for manual copy
      if (outputRef.current) {
        outputRef.current.focus();
        outputRef.current.select();
      }
      setCopyFallback(true);
    }
  }

  function handleDownload() {
    if (!output) return;
    const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const ext = direction === "json-to-yaml" ? "yaml" : "json";
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `output.${ext}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const isConvertDisabled = input.trim().length === 0;
  const isOutputEmpty = output.length === 0;

  return (
    <div className="rounded-lg border border-border bg-surface">
      {/* Direction selector */}
      <div
        role="radiogroup"
        aria-label="Conversion direction"
        className="flex items-center gap-2 border-b border-border p-4"
      >
        {(["json-to-yaml", "yaml-to-json"] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={direction === d}
            onClick={() => handleDirectionChange(d)}
            className={
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
              (direction === d
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-surface text-foreground hover:bg-surface-muted")
            }
          >
            {DIRECTION_LABELS[d]}
          </button>
        ))}
        <button
          type="button"
          onClick={handleSwap}
          disabled={isOutputEmpty}
          className="ml-auto rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Swap input and output and reverse direction"
        >
          Swap
        </button>
      </div>

      {/* Panels — stack on mobile, side-by-side on ≥lg */}
      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
        {/* Input */}
        <div>
          <label
            htmlFor="converter-input"
            className="block text-sm font-medium text-foreground"
          >
            {INPUT_LABELS[direction]}
          </label>
          <textarea
            id="converter-input"
            value={input}
            onChange={handleInputChange}
            placeholder={
              direction === "json-to-yaml"
                ? '{"name":"example"}'
                : "name: example"
            }
            rows={14}
            spellCheck={false}
            className="mt-2 w-full resize-y rounded-md border border-input-border bg-input p-3 font-mono text-sm text-foreground"
          />
        </div>

        {/* Output */}
        <div>
          <label
            htmlFor="converter-output"
            className="block text-sm font-medium text-foreground"
          >
            {OUTPUT_LABELS[direction]}
          </label>
          <textarea
            id="converter-output"
            ref={outputRef}
            value={output}
            readOnly
            rows={14}
            spellCheck={false}
            placeholder="Converted output will appear here"
            className="mt-2 w-full resize-y rounded-md border border-input-border bg-surface-muted p-3 font-mono text-sm text-foreground"
          />
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="mx-4 mb-4 rounded-md border border-destructive bg-destructive-muted px-3 py-2 text-sm text-foreground"
        >
          {error}
        </div>
      ) : null}

      {/* Copy feedback */}
      {/* Copy feedback — single aria-live region to avoid duplicate announcements */}
      {copied || copyFallback ? (
        <div
          aria-live="polite"
          className="mx-4 mb-4 text-sm text-foreground"
        >
          {copied
            ? "Copied to clipboard."
            : "Clipboard access was unavailable. The output text has been selected — press Ctrl+C (Cmd+C on Mac) to copy."}
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
        <button
          type="button"
          onClick={handleConvert}
          disabled={isConvertDisabled}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Convert
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={isOutputEmpty}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Copy
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={isOutputEmpty}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Download
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="ml-auto rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
        >
          Clear
        </button>
      </div>
    </div>
  );
}