import { useMemo, useRef, useState } from "react";
import {
  generateTraceparent,
  parseTraceparent,
  simulatePropagation,
  type ParsedTraceparent,
  type TraceFlags,
} from "./trace-context";
import {
  parseTracestate,
  formatTracestate,
  type TracestateParseResult,
} from "./tracestate";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const TEXTAREA_CLASS =
  `mt-2 w-full resize-y rounded-md border border-input-border bg-input p-3 font-mono text-sm text-foreground ${FOCUS_RING}`;
const READONLY_TEXTAREA_CLASS =
  `mt-2 w-full resize-y rounded-md border border-input-border bg-surface-muted p-3 font-mono text-sm text-foreground ${FOCUS_RING}`;

type CopyKind =
  | "generated-traceparent"
  | "generated-tracestate"
  | "generated-combined"
  | "prop-traceparent"
  | "prop-tracestate"
  | "prop-combined"
  | "prop-json"
  | "parsed-json";

type Mode = "generate" | "validate" | "propagate";

export default function OtelTraceContextPropagator() {
  const [mode, setMode] = useState<Mode>("generate");

  // ── Generate ─────────────────────────────────────────────────────
  const [genSampled, setGenSampled] = useState(true);
  const [genResult, setGenResult] = useState<ReturnType<
    typeof generateTraceparent
  > | null>(null);

  // ── Validate / propagate ─────────────────────────────────────────
  const [incomingTraceparent, setIncomingTraceparent] = useState("");
  const [incomingTracestate, setIncomingTracestate] = useState("");
  const [newSampledOverride, setNewSampledOverride] = useState<
    "preserve" | "sample" | "not-sample"
  >("preserve");

  // ── Copy feedback ────────────────────────────────────────────────
  const [copied, setCopied] = useState<CopyKind | null>(null);
  const [copyFallback, setCopyFallback] = useState<CopyKind | null>(null);
  const copyTimeoutsRef = useRef<number | null>(null);

  // ── Parsed incoming ──────────────────────────────────────────────
  const parsedIncoming: ParsedTraceparent = useMemo(
    () => parseTraceparent(incomingTraceparent),
    [incomingTraceparent],
  );
  const parsedTracestate: TracestateParseResult = useMemo(
    () => parseTracestate(incomingTracestate),
    [incomingTracestate],
  );

  const propagateResult = useMemo(() => {
    if (mode !== "propagate") return null;
    const hasTraceparent = incomingTraceparent.trim().length > 0;
    if (!hasTraceparent) {
      return simulatePropagation(
        {
          traceparent: null,
          tracestate: incomingTracestate || null,
          newSampled: overrideToBool(newSampledOverride),
        },
        true,
      );
    }
    return simulatePropagation(
      {
        traceparent: incomingTraceparent,
        tracestate: incomingTracestate || null,
        newSampled: overrideToBool(newSampledOverride),
      },
      parsedTracestate.ok,
    );
  }, [
    mode,
    incomingTraceparent,
    incomingTracestate,
    newSampledOverride,
    parsedTracestate.ok,
  ]);

  function handleGenerate() {
    setGenResult(generateTraceparent({ sampled: genSampled }));
    setCopied(null);
    setCopyFallback(null);
  }

  function handleReset() {
    setGenResult(null);
    setIncomingTraceparent("");
    setIncomingTracestate("");
    setNewSampledOverride("preserve");
    setCopied(null);
    setCopyFallback(null);
  }

  async function handleCopy(kind: CopyKind, value: string) {
    if (!value) return;
    setCopied(null);
    setCopyFallback(null);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setCopied(kind);
        if (copyTimeoutsRef.current !== null) {
          window.clearTimeout(copyTimeoutsRef.current);
        }
        copyTimeoutsRef.current = window.setTimeout(() => setCopied(null), 2000);
        return;
      }
      throw new Error("Clipboard API unavailable");
    } catch {
      setCopyFallback(kind);
    }
  }

  const liveMessage = buildLiveMessage(
    mode,
    genResult,
    parsedIncoming,
    propagateResult,
  );

  const genCombined = genResult
    ? genResult.traceparent
    : "";
  const propCombined =
    propagateResult?.kind === "ok"
      ? propagateResult.tracestate
        ? `${propagateResult.traceparent}\ntracestate: ${propagateResult.tracestate}`
        : propagateResult.traceparent
      : "";
  const propParsedJson =
    propagateResult?.kind === "ok"
      ? JSON.stringify(
          {
            traceparent: propagateResult.traceparent,
            tracestate: propagateResult.tracestate,
            traceId: propagateResult.traceId,
            parentId: propagateResult.parentId,
            traceFlags: propagateResult.traceFlags,
          },
          null,
          2,
        )
      : "";
  const incomingParsedJson =
    parsedIncoming.kind === "supported"
      ? JSON.stringify(
          {
            version: parsedIncoming.version,
            traceId: parsedIncoming.traceId,
            parentId: parsedIncoming.parentId,
            traceFlagsRaw: parsedIncoming.traceFlagsRaw,
            traceFlags: parsedIncoming.traceFlags,
          },
          null,
          2,
        )
      : "";

  return (
    <div className="rounded-lg border border-border bg-surface">
      {/* Mode selector */}
      <div
        role="tablist"
        aria-label="Tool mode"
        className="flex flex-wrap gap-2 border-b border-border p-4"
      >
        {(
          [
            ["generate", "Generate new context"],
            ["validate", "Validate incoming headers"],
            ["propagate", "Propagation simulation"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
              (mode === value
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-surface text-foreground hover:bg-surface-muted") +
              ` ${FOCUS_RING}`
            }
          >
            {label}
          </button>
        ))}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {mode === "generate" ? (
        <GeneratePanel
          sampled={genSampled}
          onSampledChange={setGenSampled}
          result={genResult}
          onGenerate={handleGenerate}
          onCopy={handleCopy}
          onClear={handleReset}
          copied={copied}
          copyFallback={copyFallback}
          combinedValue={genCombined}
        />
      ) : null}

      {mode === "validate" ? (
        <ValidatePanel
          traceparent={incomingTraceparent}
          tracestate={incomingTracestate}
          onTraceparentChange={setIncomingTraceparent}
          onTracestateChange={setIncomingTracestate}
          parsed={parsedIncoming}
          parsedTracestate={parsedTracestate}
          onCopy={handleCopy}
          copied={copied}
          copyFallback={copyFallback}
          parsedJson={incomingParsedJson}
          onClear={handleReset}
        />
      ) : null}

      {mode === "propagate" ? (
        <PropagatePanel
          traceparent={incomingTraceparent}
          tracestate={incomingTracestate}
          onTraceparentChange={setIncomingTraceparent}
          onTracestateChange={setIncomingTracestate}
          newSampledOverride={newSampledOverride}
          onNewSampledChange={setNewSampledOverride}
          parsed={parsedIncoming}
          parsedTracestate={parsedTracestate}
          result={propagateResult}
          onCopy={handleCopy}
          copied={copied}
          copyFallback={copyFallback}
          combinedValue={propCombined}
          parsedJson={propParsedJson}
          onClear={handleReset}
        />
      ) : null}

      <div className="border-t border-border p-4 text-xs text-foreground-muted">
        Browser-only simulation. This tool is not an OpenTelemetry SDK, not HTTP
        instrumentation, and never sends headers anywhere. It generates and
        validates W3C Trace Context strings locally.
      </div>
    </div>
  );
}

function overrideToBool(
  v: "preserve" | "sample" | "not-sample",
): boolean | null {
  if (v === "preserve") return null;
  return v === "sample";
}

function buildLiveMessage(
  mode: Mode,
  gen: ReturnType<typeof generateTraceparent> | null,
  parsed: ParsedTraceparent,
  prop: ReturnType<typeof simulatePropagation> | null,
): string {
  if (mode === "generate") {
    return gen ? "New trace context generated." : "";
  }
  if (mode === "validate") {
    if (parsed.kind === "supported") return "Valid version 00 traceparent.";
    if (parsed.kind === "future") return "Future version detected.";
    return "";
  }
  if (prop?.kind === "ok") return "Propagation simulation result ready.";
  if (prop?.kind === "refused") return "Propagation refused.";
  return "";
}

// ─── Generate panel ────────────────────────────────────────────────
interface GeneratePanelProps {
  sampled: boolean;
  onSampledChange: (v: boolean) => void;
  result: ReturnType<typeof generateTraceparent> | null;
  onGenerate: () => void;
  onCopy: (kind: CopyKind, value: string) => void;
  onClear: () => void;
  copied: CopyKind | null;
  copyFallback: CopyKind | null;
  combinedValue: string;
}

function GeneratePanel(props: GeneratePanelProps) {
  return (
    <div className="p-4">
      <fieldset>
        <legend className="text-sm font-medium text-foreground">
          Sampled flag
        </legend>
        <div className="mt-2 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name="gen-sampled"
              checked={props.sampled}
              onChange={() => props.onSampledChange(true)}
              className={FOCUS_RING}
            />
            Sampled
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name="gen-sampled"
              checked={!props.sampled}
              onChange={() => props.onSampledChange(false)}
              className={FOCUS_RING}
            />
            Not sampled
          </label>
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={props.onGenerate}
          className={`rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover ${FOCUS_RING}`}
        >
          Generate new context
        </button>
        <button
          type="button"
          onClick={props.onClear}
          className={`ml-auto rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted ${FOCUS_RING}`}
        >
          Clear
        </button>
      </div>

      {props.result ? (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label
                htmlFor="gen-trace-id"
                className="block text-sm font-medium text-foreground"
              >
                Trace ID (128-bit)
              </label>
              <textarea
                id="gen-trace-id"
                value={props.result.traceId}
                readOnly
                rows={2}
                className={READONLY_TEXTAREA_CLASS}
              />
            </div>
            <div>
              <label
                htmlFor="gen-parent-id"
                className="block text-sm font-medium text-foreground"
              >
                Parent ID (64-bit)
              </label>
              <textarea
                id="gen-parent-id"
                value={props.result.parentId}
                readOnly
                rows={2}
                className={READONLY_TEXTAREA_CLASS}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="gen-traceparent"
              className="block text-sm font-medium text-foreground"
            >
              traceparent
            </label>
            <textarea
              id="gen-traceparent"
              value={props.result.traceparent}
              readOnly
              rows={2}
              className={READONLY_TEXTAREA_CLASS}
            />
          </div>
          <FlagDisplay flags={props.result.traceFlags} />
          <CopyBar
            onCopy={props.onCopy}
            copied={props.copied}
            copyFallback={props.copyFallback}
            actions={[
              {
                kind: "generated-traceparent",
                label: "Copy traceparent",
                value: props.result.traceparent,
              },
              {
                kind: "generated-combined",
                label: "Copy combined headers",
                value: props.combinedValue,
              },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

// ─── Validate panel ────────────────────────────────────────────────
interface ValidatePanelProps {
  traceparent: string;
  tracestate: string;
  onTraceparentChange: (v: string) => void;
  onTracestateChange: (v: string) => void;
  parsed: ParsedTraceparent;
  parsedTracestate: TracestateParseResult;
  onCopy: (kind: CopyKind, value: string) => void;
  copied: CopyKind | null;
  copyFallback: CopyKind | null;
  parsedJson: string;
  onClear: () => void;
}

function ValidatePanel(props: ValidatePanelProps) {
  return (
    <div className="p-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <label
            htmlFor="val-traceparent"
            className="block text-sm font-medium text-foreground"
          >
            Incoming traceparent
          </label>
          <textarea
            id="val-traceparent"
            value={props.traceparent}
            onChange={(e) => props.onTraceparentChange(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
            className={TEXTAREA_CLASS}
          />
        </div>
        <div>
          <label
            htmlFor="val-tracestate"
            className="block text-sm font-medium text-foreground"
          >
            Incoming tracestate (optional)
          </label>
          <textarea
            id="val-tracestate"
            value={props.tracestate}
            onChange={(e) => props.onTracestateChange(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="vendor=value,other=value"
            className={TEXTAREA_CLASS}
          />
        </div>
      </div>

      <div className="mt-4">
        <TraceparentStatus parsed={props.parsed} />
      </div>

      {props.parsedTracestate.entries.length > 0 ||
      props.parsedTracestate.errors.length > 0 ||
      props.parsedTracestate.warnings.length > 0 ? (
        <div className="mt-4">
          <TracestateStatus result={props.parsedTracestate} />
        </div>
      ) : null}

      {props.parsed.kind === "supported" ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label
                htmlFor="val-trace-id"
                className="block text-sm font-medium text-foreground"
              >
                Trace ID
              </label>
              <textarea
                id="val-trace-id"
                value={props.parsed.traceId}
                readOnly
                rows={2}
                className={READONLY_TEXTAREA_CLASS}
              />
            </div>
            <div>
              <label
                htmlFor="val-parent-id"
                className="block text-sm font-medium text-foreground"
              >
                Parent ID
              </label>
              <textarea
                id="val-parent-id"
                value={props.parsed.parentId}
                readOnly
                rows={2}
                className={READONLY_TEXTAREA_CLASS}
              />
            </div>
          </div>
          <div className="mt-4">
            <FlagDisplay flags={props.parsed.traceFlags} />
          </div>
        </>
      ) : null}

      <CopyBar
        onCopy={props.onCopy}
        copied={props.copied}
        copyFallback={props.copyFallback}
        actions={[
          {
            kind: "parsed-json",
            label: "Copy parsed JSON",
            value: props.parsedJson,
          },
        ]}
        onClear={props.onClear}
      />
    </div>
  );
}

// ─── Propagate panel ───────────────────────────────────────────────
interface PropagatePanelProps {
  traceparent: string;
  tracestate: string;
  onTraceparentChange: (v: string) => void;
  onTracestateChange: (v: string) => void;
  newSampledOverride: "preserve" | "sample" | "not-sample";
  onNewSampledChange: (v: "preserve" | "sample" | "not-sample") => void;
  parsed: ParsedTraceparent;
  parsedTracestate: TracestateParseResult;
  result: ReturnType<typeof simulatePropagation> | null;
  onCopy: (kind: CopyKind, value: string) => void;
  copied: CopyKind | null;
  copyFallback: CopyKind | null;
  combinedValue: string;
  parsedJson: string;
  onClear: () => void;
}

function PropagatePanel(props: PropagatePanelProps) {
  return (
    <div className="p-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <label
            htmlFor="prop-traceparent"
            className="block text-sm font-medium text-foreground"
          >
            Incoming traceparent
          </label>
          <textarea
            id="prop-traceparent"
            value={props.traceparent}
            onChange={(e) => props.onTraceparentChange(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
            className={TEXTAREA_CLASS}
          />
        </div>
        <div>
          <label
            htmlFor="prop-tracestate"
            className="block text-sm font-medium text-foreground"
          >
            Incoming tracestate (optional)
          </label>
          <textarea
            id="prop-tracestate"
            value={props.tracestate}
            onChange={(e) => props.onTracestateChange(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="vendor=value,other=value"
            className={TEXTAREA_CLASS}
          />
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-foreground">
          Outgoing sampled decision
        </legend>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          {(
            [
              ["preserve", "Preserve incoming"],
              ["sample", "Force sampled"],
              ["not-sample", "Force not sampled"],
            ] as const
          ).map(([v, label]) => (
            <label
              key={v}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <input
                type="radio"
                name="prop-sampled"
                checked={props.newSampledOverride === v}
                onChange={() => props.onNewSampledChange(v)}
                className={FOCUS_RING}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4">
        <TraceparentStatus parsed={props.parsed} />
      </div>

      {props.parsedTracestate.entries.length > 0 ||
      props.parsedTracestate.errors.length > 0 ||
      props.parsedTracestate.warnings.length > 0 ? (
        <div className="mt-4">
          <TracestateStatus result={props.parsedTracestate} />
        </div>
      ) : null}

      {props.result?.kind === "refused" ? (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-4 rounded-md border border-destructive bg-destructive-muted px-3 py-2 text-sm text-foreground"
        >
          {props.result.reason}
        </div>
      ) : null}

      {props.result?.kind === "ok" ? (
        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="prop-out-traceparent"
              className="block text-sm font-medium text-foreground"
            >
              Outgoing traceparent
            </label>
            <textarea
              id="prop-out-traceparent"
              value={props.result.traceparent}
              readOnly
              rows={2}
              className={READONLY_TEXTAREA_CLASS}
            />
          </div>
          {props.result.tracestate ? (
            <div>
              <label
                htmlFor="prop-out-tracestate"
                className="block text-sm font-medium text-foreground"
              >
                Outgoing tracestate
              </label>
              <textarea
                id="prop-out-tracestate"
                value={props.result.tracestate}
                readOnly
                rows={2}
                className={READONLY_TEXTAREA_CLASS}
              />
            </div>
          ) : null}
          <FlagDisplay flags={props.result.traceFlags} />
          <ul className="space-y-1 text-xs text-foreground-muted">
            {props.result.notes.map((n, i) => (
              <li key={i}>• {n}</li>
            ))}
          </ul>
          <CopyBar
            onCopy={props.onCopy}
            copied={props.copied}
            copyFallback={props.copyFallback}
            actions={[
              {
                kind: "prop-traceparent",
                label: "Copy traceparent",
                value: props.result.traceparent,
              },
              {
                kind: "prop-tracestate",
                label: "Copy tracestate",
                value: props.result.tracestate ?? "",
              },
              {
                kind: "prop-combined",
                label: "Copy combined headers",
                value: props.combinedValue,
              },
              {
                kind: "prop-json",
                label: "Copy parsed JSON",
                value: props.parsedJson,
              },
            ]}
            onClear={props.onClear}
          />
        </div>
      ) : null}
    </div>
  );
}

// ─── Shared subcomponents ──────────────────────────────────────────
function FlagDisplay({ flags }: { flags: TraceFlags }) {
  return (
    <div className="rounded-md border border-border bg-surface-muted p-3 text-xs text-foreground">
      <p className="font-medium">Trace flags</p>
      <ul className="mt-1 space-y-0.5">
        <li>sampled: {flags.sampled ? "true" : "false"} (bit 0)</li>
        <li>
          random trace-id: {flags.randomTraceId ? "true" : "false"} (bit 1)
        </li>
        <li>reserved: {flags.reserved} (bits 2–7)</li>
      </ul>
    </div>
  );
}

function TraceparentStatus({ parsed }: { parsed: ParsedTraceparent }) {
  if (parsed.kind === "supported") {
    return (
      <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground">
        Valid version 00 traceparent.
      </div>
    );
  }
  if (parsed.kind === "future") {
    return (
      <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground">
        <p>
          Version {parsed.version} is newer than this tool supports for full
          validation. The base fields below are shown as unverified.
        </p>
        {parsed.base ? (
          <ul className="mt-2 space-y-0.5 font-mono text-xs">
            <li>version: {parsed.version}</li>
            <li>trace-id: {parsed.base.traceId}</li>
            <li>parent-id: {parsed.base.parentId}</li>
            <li>trace-flags: {parsed.base.traceFlagsRaw} (unverified)</li>
          </ul>
        ) : (
          <p className="mt-2 text-xs">{parsed.baseUnavailableReason}</p>
        )}
      </div>
    );
  }
  if (parsed.errors.length > 0) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="rounded-md border border-destructive bg-destructive-muted px-3 py-2 text-sm text-foreground"
      >
        <p className="font-medium">Invalid traceparent</p>
        <ul className="mt-1 list-disc pl-5">
          {parsed.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    );
  }
  return null;
}

function TracestateStatus({ result }: { result: TracestateParseResult }) {
  return (
    <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground">
      {result.ok ? (
        <p>tracestate is grammatically valid ({result.entries.length} entries).</p>
      ) : (
        <div role="alert" aria-live="assertive">
          <p className="font-medium">Invalid tracestate</p>
          <ul className="mt-1 list-disc pl-5">
            {result.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {result.warnings.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-xs">
          {result.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}
      {result.entries.length > 0 ? (
        <p className="mt-2 font-mono text-xs">
          {formatTracestate(result.entries)}
        </p>
      ) : null}
    </div>
  );
}

interface CopyAction {
  kind: CopyKind;
  label: string;
  value: string;
}

function CopyBar({
  onCopy,
  copied,
  copyFallback,
  actions,
  onClear,
}: {
  onCopy: (kind: CopyKind, value: string) => void;
  copied: CopyKind | null;
  copyFallback: CopyKind | null;
  actions: CopyAction[];
  onClear?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((a) => (
        <button
          key={a.kind}
          type="button"
          onClick={() => onCopy(a.kind, a.value)}
          disabled={a.value.length === 0}
          className={`rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
        >
          {a.label}
        </button>
      ))}
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className={`ml-auto rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted ${FOCUS_RING}`}
        >
          Clear
        </button>
      ) : null}
      {copied || copyFallback ? (
        <p aria-live="polite" className="w-full text-sm text-foreground">
          {copied
            ? "Copied to clipboard."
            : "Clipboard access was unavailable. The value was not copied."}
        </p>
      ) : null}
    </div>
  );
}