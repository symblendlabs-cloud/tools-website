import { useMemo, useRef, useState } from "react";
import {
  hashGraphQLSource,
  utf8ByteLength,
  type HashResult,
} from "./hash";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

export default function GraphQLPersistedQueryHash() {
  const [source, setSource] = useState("");
  const [result, setResult] = useState<HashResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"hash" | "apq" | null>(null);
  const [copyFallback, setCopyFallback] = useState<"hash" | "apq" | null>(null);
  const hashRef = useRef<HTMLTextAreaElement>(null);
  const apqRef = useRef<HTMLTextAreaElement>(null);
  // Monotonic request id. Incremented on every source edit and every
  // Generate click. A promise whose captured id is no longer current is
  // stale and must not write result or busy state.
  const requestIdRef = useRef(0);

  const charCount = source.length;
  const byteCount = useMemo(() => utf8ByteLength(source), [source]);
  const isEmpty = source.length === 0;

  const hash = result?.ok ? result.hash : "";
  const apqJson = result?.ok ? result.apqJson : "";
  const error = result && !result.ok ? result.error : null;

  function invalidate() {
    setResult(null);
    setCopied(null);
    setCopyFallback(null);
  }

  function handleSourceChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    // Supersede any in-flight hash: its result belongs to the previous text.
    requestIdRef.current += 1;
    setBusy(false);
    setSource(e.target.value);
    invalidate();
  }

  async function handleGenerate() {
    const myId = ++requestIdRef.current;
    const sourceSnapshot = source;
    setCopied(null);
    setCopyFallback(null);
    setBusy(true);
    try {
      const next = await hashGraphQLSource(sourceSnapshot);
      if (myId !== requestIdRef.current) return;
      setResult(next);
    } finally {
      if (myId === requestIdRef.current) setBusy(false);
    }
  }

  function handleClear() {
    requestIdRef.current += 1;
    setBusy(false);
    setSource("");
    setResult(null);
    setCopied(null);
    setCopyFallback(null);
  }

  async function handleCopy(kind: "hash" | "apq") {
    const value = kind === "hash" ? hash : apqJson;
    if (!value) return;
    setCopied(null);
    setCopyFallback(null);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setCopied(kind);
        window.setTimeout(() => setCopied(null), 2000);
        return;
      }
      throw new Error("Clipboard API unavailable");
    } catch {
      const ref = kind === "hash" ? hashRef : apqRef;
      if (ref.current) {
        ref.current.focus();
        ref.current.select();
      }
      setCopyFallback(kind);
    }
  }

  const canGenerate = !isEmpty && !busy;
  const hasHash = hash.length > 0;

  const liveMessage = busy ? "Hashing…" : hasHash ? "Hash ready." : "";

  return (
    <div
      className="rounded-lg border border-border bg-surface"
      aria-busy={busy}
    >
      <div className="border-b border-border p-4">
        <label
          htmlFor="gql-source"
          className="block text-sm font-medium text-foreground"
        >
          GraphQL source
        </label>
        <textarea
          id="gql-source"
          value={source}
          onChange={handleSourceChange}
          rows={14}
          spellCheck={false}
          placeholder={'query GetUser($id: ID!) {\n  user(id: $id) { id name }\n}'}
          className={`mt-2 w-full resize-y rounded-md border border-input-border bg-input p-3 font-mono text-sm text-foreground ${FOCUS_RING}`}
        />
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-foreground-muted">
          <span>{charCount} UTF-16 code units</span>
          <span>{byteCount} UTF-8 bytes</span>
        </div>
        <p className="mt-2 text-xs text-foreground-muted">
          The hash is computed over the exact source string. Whitespace,
          formatting, and comments are <strong>not</strong> normalized before
          hashing.
        </p>
        <p role="status" aria-live="polite" className="sr-only">
          {liveMessage}
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="mx-4 mt-4 rounded-md border border-destructive bg-destructive-muted px-3 py-2 text-sm text-foreground"
        >
          {error}
        </div>
      ) : null}

      {hasHash ? (
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
          <div>
            <label
              htmlFor="gql-hash"
              className="block text-sm font-medium text-foreground"
            >
              SHA-256 hash
            </label>
            <textarea
              id="gql-hash"
              ref={hashRef}
              value={hash}
              readOnly
              rows={3}
              spellCheck={false}
              aria-readonly="true"
              className={`mt-2 w-full resize-y rounded-md border border-input-border bg-surface-muted p-3 font-mono text-sm text-foreground ${FOCUS_RING}`}
            />
          </div>
          <div>
            <label
              htmlFor="gql-apq"
              className="block text-sm font-medium text-foreground"
            >
              Apollo APQ v1 extension
            </label>
            <textarea
              id="gql-apq"
              ref={apqRef}
              value={apqJson}
              readOnly
              rows={3}
              spellCheck={false}
              aria-readonly="true"
              className={`mt-2 w-full resize-y rounded-md border border-input-border bg-surface-muted p-3 font-mono text-sm text-foreground ${FOCUS_RING}`}
            />
          </div>
        </div>
      ) : null}

      {copied || copyFallback ? (
        <div aria-live="polite" className="mx-4 mb-4 text-sm text-foreground">
          {copied
            ? "Copied to clipboard."
            : "Clipboard access was unavailable. The value has been selected — press Ctrl+C (Cmd+C on Mac) to copy."}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
        >
          {busy ? "Generating…" : "Generate hash"}
        </button>
        <button
          type="button"
          onClick={() => handleCopy("hash")}
          disabled={!hasHash}
          className={`rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
        >
          Copy hash
        </button>
        <button
          type="button"
          onClick={() => handleCopy("apq")}
          disabled={!hasHash}
          className={`rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
        >
          Copy APQ JSON
        </button>
        <button
          type="button"
          onClick={handleClear}
          className={`ml-auto rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted ${FOCUS_RING}`}
        >
          Clear
        </button>
      </div>

      <div className="border-t border-border p-4 text-xs text-foreground-muted">
        Generating a hash locally does not register or safelist the persisted
        query with any GraphQL server. On an initial APQ cache miss, an
        application can send the full query together with its hash, and the
        server may then store the query and accept hash-only requests on
        subsequent calls. This tool only generates the hash and APQ extension
        — it does not communicate with GraphQL servers.
      </div>
    </div>
  );
}