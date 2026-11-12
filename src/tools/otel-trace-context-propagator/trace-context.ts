// W3C Trace Context Level 2 — traceparent grammar, identifier generation,
// flag decoding, and propagation simulation.
//
// References:
//   https://www.w3.org/TR/trace-context-2/
//   https://www.w3.org/TR/trace-context/
//
// This module is pure: no DOM, no network, no storage. Identifier generation
// uses only globalThis.crypto.getRandomValues. Math.random() is never used.

export const TRACE_ID_HEX_LENGTH = 32;
export const PARENT_ID_HEX_LENGTH = 16;
export const TRACE_FLAGS_HEX_LENGTH = 2;
export const SUPPORTED_VERSION = "00";
export const FORBIDDEN_VERSION = "ff";

const HEX_LOWER_RE = /^[0-9a-f]+$/;
const VERSION_RE = /^[0-9a-f]{2}$/;
const TRACE_ID_RE = /^[0-9a-f]{32}$/;
const PARENT_ID_RE = /^[0-9a-f]{16}$/;
const TRACE_FLAGS_RE = /^[0-9a-f]{2}$/;

export interface TraceFlags {
  sampled: boolean;
  randomTraceId: boolean;
  /** Bits 2..7 as a 6-bit integer (0..63). */
  reserved: number;
}

export interface ParsedTraceparentV00 {
  kind: "supported";
  version: "00";
  traceId: string;
  parentId: string;
  traceFlagsRaw: string;
  traceFlags: TraceFlags;
}

export interface ParsedTraceparentFuture {
  kind: "future";
  version: string;
  /** Base fields parsed from the fixed-layout prefix. Unverified. */
  base: {
    traceId: string;
    parentId: string;
    traceFlagsRaw: string;
  } | null;
  /** If base is null, the reason it could not be safely inspected. */
  baseUnavailableReason: string | null;
  /**
   * Number of hyphen-separated components beyond the four base fields.
   * These are not interpreted; future versions may define their meaning.
   */
  extraFieldCount: number;
}

export interface ParsedTraceparentInvalid {
  kind: "invalid";
  errors: string[];
}

export type ParsedTraceparent =
  | ParsedTraceparentV00
  | ParsedTraceparentFuture
  | ParsedTraceparentInvalid;

function isAllZeroHex(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) !== 0x30 /* '0' */) return false;
  }
  return true;
}

function decodeTraceFlags(byte: number): TraceFlags {
  return {
    sampled: (byte & 0x01) !== 0,
    randomTraceId: (byte & 0x02) !== 0,
    reserved: (byte & 0xfc) >> 2,
  };
}

function toHexByte(n: number): string {
  return n.toString(16).padStart(2, "0");
}

/** Generate a 128-bit trace ID as 32 lowercase hex characters. Never all-zero. */
export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  for (;;) {
    globalThis.crypto.getRandomValues(bytes);
    let hex = "";
    for (const b of bytes) hex += toHexByte(b);
    if (!isAllZeroHex(hex)) return hex;
  }
}

/** Generate a 64-bit parent/span ID as 16 lowercase hex characters. Never all-zero. */
export function generateParentId(): string {
  const bytes = new Uint8Array(8);
  for (;;) {
    globalThis.crypto.getRandomValues(bytes);
    let hex = "";
    for (const b of bytes) hex += toHexByte(b);
    if (!isAllZeroHex(hex)) return hex;
  }
}

export interface GenerateOptions {
  sampled: boolean;
}

/**
 * Generate a complete version 00 traceparent for a brand new trace.
 * The random trace ID flag (bit 1) is always set because the ID is random.
 */
export function generateTraceparent(options: GenerateOptions): {
  traceparent: string;
  traceId: string;
  parentId: string;
  traceFlags: TraceFlags;
} {
  const traceId = generateTraceId();
  const parentId = generateParentId();
  const flags: TraceFlags = {
    sampled: options.sampled,
    randomTraceId: true,
    reserved: 0,
  };
  const flagsByte =
    (flags.sampled ? 0x01 : 0) |
    (flags.randomTraceId ? 0x02 : 0) |
    (flags.reserved << 2);
  const traceFlagsRaw = toHexByte(flagsByte);
  const traceparent = `${SUPPORTED_VERSION}-${traceId}-${parentId}-${traceFlagsRaw}`;
  return { traceparent, traceId, parentId, traceFlags: flags };
}

function isAsciiWhitespaceCodePoint(cp: number): boolean {
  // SP, HTAB, LF, CR — the whitespace that could plausibly appear around
  // an HTTP header value. Rejecting any of these at the edges keeps the
  // parse strict.
  return cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d;
}

/**
 * Parse a traceparent header. Version 00 is fully validated. Versions
 * 01..fe are grammar-checked and base fields are exposed as unverified.
 * Version ff is forbidden. Anything else is invalid.
 */
export function parseTraceparent(input: string): ParsedTraceparent {
  if (input.length === 0) {
    return { kind: "invalid", errors: ["traceparent is empty."] };
  }

  const first = input.charCodeAt(0);
  const last = input.charCodeAt(input.length - 1);
  // Reject any leading or trailing whitespace in the raw supplied value.
  // The specification's header value is exact; surrounding whitespace is
  // not part of traceparent and must not be silently tolerated.
  if (isAsciiWhitespaceCodePoint(first) || isAsciiWhitespaceCodePoint(last)) {
    return {
      kind: "invalid",
      errors: [
        "traceparent must not contain leading or trailing whitespace.",
      ],
    };
  }

  const parts = input.split("-");
  if (parts.length < 4) {
    return {
      kind: "invalid",
      errors: [
        `traceparent must have at least 4 hyphen-separated fields; found ${parts.length}.`,
      ],
    };
  }

  const version = parts[0] ?? "";
  const traceId = parts[1] ?? "";
  const parentId = parts[2] ?? "";
  const traceFlagsRaw = parts[3] ?? "";
  const extraFieldCount = parts.length - 4;
  const errors: string[] = [];

  if (!VERSION_RE.test(version)) {
    errors.push(
      "version must be exactly two lowercase hexadecimal characters.",
    );
  } else if (version === FORBIDDEN_VERSION) {
    errors.push("version ff is forbidden by the specification.");
  }

  if (version === SUPPORTED_VERSION && extraFieldCount > 0) {
    errors.push(
      `version 00 traceparent must have exactly 4 hyphen-separated fields; found ${parts.length}.`,
    );
  }

  if (!TRACE_ID_RE.test(traceId)) {
    errors.push(
      "trace-id must be exactly 32 lowercase hexadecimal characters.",
    );
  } else if (isAllZeroHex(traceId)) {
    errors.push("trace-id must not be all zeros.");
  }

  if (!PARENT_ID_RE.test(parentId)) {
    errors.push(
      "parent-id must be exactly 16 lowercase hexadecimal characters.",
    );
  } else if (isAllZeroHex(parentId)) {
    errors.push("parent-id must not be all zeros.");
  }

  if (!TRACE_FLAGS_RE.test(traceFlagsRaw)) {
    errors.push(
      "trace-flags must be exactly two lowercase hexadecimal characters.",
    );
  }

  if (errors.length > 0) {
    return { kind: "invalid", errors };
  }

  if (version !== SUPPORTED_VERSION) {
    return {
      kind: "future",
      version,
      base: { traceId, parentId, traceFlagsRaw },
      baseUnavailableReason: null,
      extraFieldCount,
    };
  }

  const flagsByte = parseInt(traceFlagsRaw, 16);
  return {
    kind: "supported",
    version: "00",
    traceId,
    parentId,
    traceFlagsRaw,
    traceFlags: decodeTraceFlags(flagsByte),
  };
}

export interface PropagationInput {
  traceparent: string | null;
  tracestate: string | null;
  /** Explicit tracing decision, or null to preserve the incoming sampled flag. */
  newSampled: boolean | null;
}

export type PropagationResult =
  | {
      kind: "ok";
      traceparent: string;
      tracestate: string | null;
      traceId: string;
      parentId: string;
      traceFlags: TraceFlags;
      notes: string[];
    }
  | {
      kind: "refused";
      reason: string;
    };

/**
 * Simulate propagation. For valid v00 input: preserve trace-id, regenerate
 * parent-id, preserve random-trace-id flag, keep or override sampled flag
 * only if the caller supplies an explicit decision, keep reserved bits zero,
 * preserve valid tracestate verbatim. For missing traceparent: start a fresh
 * trace. For invalid or future: refuse.
 *
 * `incomingTracestateValid` is passed in by the caller because tracestate
 * parsing lives in a separate module; the caller has already decided whether
 * the tracestate string is valid. A tracestate without a traceparent is
 * always discarded.
 */
export function simulatePropagation(
  input: PropagationInput,
  incomingTracestateValid: boolean,
): PropagationResult {
  const incoming = input.traceparent;

  // Only a literal `null` means "no incoming traceparent". Empty and
  // whitespace-only strings are supplied values and must go through
  // parseTraceparent(), which rejects any leading/trailing whitespace
  // and any malformed structure. Silently treating "" as "no context"
  // would mask a caller bug that supplies a blank header.
  if (incoming === null) {
    const generated = generateTraceparent({
      sampled: input.newSampled ?? true,
    });
    return {
      kind: "ok",
      traceparent: generated.traceparent,
      tracestate: null,
      traceId: generated.traceId,
      parentId: generated.parentId,
      traceFlags: generated.traceFlags,
      notes: input.tracestate
        ? [
            "No incoming traceparent: a new trace was generated and any incoming tracestate was discarded.",
          ]
        : ["No incoming traceparent: a new trace was generated."],
    };
  }

  const parsed = parseTraceparent(incoming);

  if (parsed.kind === "invalid") {
    return {
      kind: "refused",
      reason:
        "Propagation cannot continue from an invalid traceparent. Fix the incoming header first.",
    };
  }

  if (parsed.kind === "future") {
    return {
      kind: "refused",
      reason: `Propagation simulation is disabled for unsupported version ${parsed.version}. Future versions may define fields this tool cannot safely propagate.`,
    };
  }

  const sampled =
    input.newSampled !== null ? input.newSampled : parsed.traceFlags.sampled;
  const flags: TraceFlags = {
    sampled,
    randomTraceId: parsed.traceFlags.randomTraceId,
    reserved: 0,
  };
  const flagsByte =
    (flags.sampled ? 0x01 : 0) |
    (flags.randomTraceId ? 0x02 : 0) |
    (flags.reserved << 2);
  const traceFlagsRaw = toHexByte(flagsByte);
  const parentId = generateParentId();
  const traceparent = `${SUPPORTED_VERSION}-${parsed.traceId}-${parentId}-${traceFlagsRaw}`;

  const notes: string[] = [
    "trace-id preserved from the incoming traceparent.",
    "parent-id regenerated for the outgoing request.",
  ];
  if (
    input.newSampled !== null &&
    input.newSampled !== parsed.traceFlags.sampled
  ) {
    notes.push(
      `sampled flag changed by explicit tracing decision (was ${parsed.traceFlags.sampled}, now ${sampled}).`,
    );
  } else {
    notes.push("sampled flag preserved from the incoming traceparent.");
  }

  let outTracestate: string | null = null;
  if (input.tracestate !== null && input.tracestate.trim().length > 0) {
    if (incomingTracestateValid) {
      outTracestate = input.tracestate;
      notes.push("tracestate preserved verbatim.");
    } else {
      notes.push(
        "Incoming tracestate was invalid and has been dropped; the valid traceparent is still propagated.",
      );
    }
  }

  return {
    kind: "ok",
    traceparent,
    tracestate: outTracestate,
    traceId: parsed.traceId,
    parentId,
    traceFlags: flags,
    notes,
  };
}