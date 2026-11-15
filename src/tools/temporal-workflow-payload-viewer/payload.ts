// src/tools/temporal-workflow-payload-viewer/payload.ts
// Pure parsing/decoding for Temporal Payload JSON. No React, DOM, network, console, storage, or eval.
// All public functions return results; none throw.

export const PASTE_LIMIT_BYTES = 8 * 1024 * 1024;
export const FILE_LIMIT_BYTES = 16 * 1024 * 1024;

export interface ParsedPayload {
  index: number;
  encoding: string | null;
  encodingBase64: string | null;
  dataBase64: string;
  dataBytes: Uint8Array | null;
  dataUtf8: string | null;
  warnings: string[];
}

export type ParseResult =
  | { ok: true; payloads: ParsedPayload[]; warnings: string[] }
  | { ok: false; error: string };

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function decodeBase64ToBytes(b64: string): Uint8Array | null {
  if (typeof b64 !== "string") return null;
  if (b64.length === 0) return new Uint8Array(0);
  if (b64.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return null;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function tryDecodeUtf8(bytes: Uint8Array): string | null {
  if (!(bytes instanceof Uint8Array)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function inspectOnePayload(raw: unknown, index: number): ParsedPayload {
  const warnings: string[] = [];
  let encodingBase64: string | null = null;
  let encoding: string | null = null;
  let dataBase64 = "";
  let dataBytes: Uint8Array | null = null;
  let dataUtf8: string | null = null;

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    warnings.push("Payload is not a JSON object.");
    return { index, encoding: null, encodingBase64: null, dataBase64: "", dataBytes: null, dataUtf8: null, warnings };
  }

  const obj = raw as Record<string, unknown>;

  if (!("metadata" in obj)) {
    warnings.push("Missing `metadata` field.");
  } else if (typeof obj.metadata !== "object" || obj.metadata === null || Array.isArray(obj.metadata)) {
    warnings.push("`metadata` is not an object.");
  } else {
    const md = obj.metadata as Record<string, unknown>;
    const rawEnc = md["encoding"];
    if (rawEnc === undefined) {
      warnings.push("`metadata.encoding` is absent; encoding is unknown.");
    } else if (typeof rawEnc !== "string") {
      warnings.push("`metadata.encoding` is not a string.");
    } else {
      encodingBase64 = rawEnc;
      const encBytes = decodeBase64ToBytes(rawEnc);
      if (encBytes === null) {
        warnings.push("`metadata.encoding` is not valid base64.");
      } else {
        const encText = tryDecodeUtf8(encBytes);
        if (encText === null) warnings.push("`metadata.encoding` bytes are not valid UTF-8.");
        else encoding = encText;
      }
    }
  }

  if (!("data" in obj)) {
    warnings.push("Missing `data` field.");
  } else if (typeof obj.data !== "string") {
    warnings.push("`data` is not a string.");
  } else {
    dataBase64 = obj.data;
    dataBytes = decodeBase64ToBytes(obj.data);
    if (dataBytes === null) warnings.push("`data` is not valid base64.");
  }

  if (dataBytes !== null && encoding !== null) {
    if (encoding === "json/plain") {
      dataUtf8 = tryDecodeUtf8(dataBytes);
      if (dataUtf8 === null) warnings.push("`data` is not valid UTF-8 even though encoding is json/plain.");
    } else if (encoding === "binary/null") {
      if (dataBytes.length > 0) warnings.push("encoding is binary/null but data is non-empty.");
    } else {
      const tentative = tryDecodeUtf8(dataBytes);
      if (tentative !== null) dataUtf8 = tentative;
      warnings.push(
        `Encoding "${encoding}" is not decoded automatically; showing raw bytes${tentative !== null ? " (bytes are valid UTF-8, shown as text)" : ""}.`,
      );
    }
  } else if (dataBytes !== null) {
    const tentative = tryDecodeUtf8(dataBytes);
    if (tentative !== null) dataUtf8 = tentative;
  }

  return { index, encoding, encodingBase64, dataBase64, dataBytes, dataUtf8, warnings };
}

export function parsePayloadJson(text: string): ParseResult {
  if (typeof text !== "string") return { ok: false, error: "Input is not a string." };
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, error: "Input is empty." };
  if (utf8ByteLength(text) > PASTE_LIMIT_BYTES) {
    return { ok: false, error: `Input exceeds the ${PASTE_LIMIT_BYTES} byte paste limit.` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Invalid JSON: ${message}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Top-level JSON value must be an object with a `payloads` array." };
  }

  const obj = parsed as Record<string, unknown>;
  if (!("payloads" in obj)) return { ok: false, error: "Top-level object is missing the `payloads` field." };
  if (!Array.isArray(obj.payloads)) return { ok: false, error: "`payloads` must be an array." };

  const warnings: string[] = [];
  if (obj.payloads.length === 0) warnings.push("`payloads` is empty.");

  const payloads: ParsedPayload[] = obj.payloads.map((raw, i) => inspectOnePayload(raw, i));
  return { ok: true, payloads, warnings };
}

export function buildInspectionReport(result: ParseResult): string {
  if (!result.ok) return JSON.stringify({ ok: false, error: result.error }, null, 2);
  return JSON.stringify(
    {
      ok: true,
      warnings: result.warnings,
      payloads: result.payloads.map((p) => ({
        index: p.index,
        encoding: p.encoding,
        encodingBase64: p.encodingBase64,
        dataBase64Length: p.dataBase64.length,
        dataByteLength: p.dataBytes === null ? null : p.dataBytes.length,
        dataUtf8: p.dataUtf8,
        warnings: p.warnings,
      })),
    },
    null,
    2,
  );
}