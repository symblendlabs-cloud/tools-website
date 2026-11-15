// src/tools/temporal-workflow-payload-viewer/__tests__/payload.test.ts
import { describe, expect, it } from "vitest";
import {
  PASTE_LIMIT_BYTES,
  buildInspectionReport,
  decodeBase64ToBytes,
  parsePayloadJson,
  tryDecodeUtf8,
  utf8ByteLength,
} from "../payload";

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}
function b64Bytes(bytes: number[]): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

const JSON_PLAIN = b64("json/plain");
const BINARY_PLAIN = b64("binary/plain");

describe("decodeBase64ToBytes", () => {
  it("decodes valid base64", () => {
    const bytes = decodeBase64ToBytes(b64("hello"));
    expect(bytes).not.toBeNull();
    expect(Array.from(bytes!)).toEqual([104, 101, 108, 108, 111]);
  });
  it("returns empty Uint8Array for empty string", () => {
    expect(decodeBase64ToBytes("")!.length).toBe(0);
  });
  it("returns null for invalid base64", () => {
    expect(decodeBase64ToBytes("!!!notbase64!!!")).toBeNull();
  });
  it("returns null for wrong-length base64", () => {
    expect(decodeBase64ToBytes("abcde")).toBeNull();
  });
  it("returns null for non-string input", () => {
    expect(decodeBase64ToBytes(undefined as unknown as string)).toBeNull();
    expect(decodeBase64ToBytes(null as unknown as string)).toBeNull();
  });
});

describe("tryDecodeUtf8", () => {
  it("decodes valid UTF-8", () => {
    expect(tryDecodeUtf8(new TextEncoder().encode("héllo"))).toBe("héllo");
  });
  it("returns null for invalid UTF-8", () => {
    expect(tryDecodeUtf8(new Uint8Array([0xff, 0xfe, 0xfd]))).toBeNull();
  });
  it("returns null for non-Uint8Array input", () => {
    expect(tryDecodeUtf8("nope" as unknown as Uint8Array)).toBeNull();
  });
});

describe("utf8ByteLength", () => {
  it("returns byte length, not code-unit length", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("😀")).toBe(4);
  });
});

describe("parsePayloadJson — happy path", () => {
  it("parses a single json/plain payload", () => {
    const doc = JSON.stringify({
      payloads: [{ metadata: { encoding: JSON_PLAIN }, data: b64('{"orderId":"123"}') }],
    });
    const result = parsePayloadJson(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.payloads[0]!;
    expect(p.encoding).toBe("json/plain");
    expect(p.encodingBase64).toBe(JSON_PLAIN);
    expect(p.dataUtf8).toBe('{"orderId":"123"}');
    expect(p.warnings).toEqual([]);
  });
  it("parses a binary/plain payload without attempting UTF-8 decode", () => {
    const doc = JSON.stringify({
      payloads: [{ metadata: { encoding: BINARY_PLAIN }, data: b64Bytes([0x00, 0xff]) }],
    });
    const result = parsePayloadJson(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.payloads[0]!;
    expect(p.encoding).toBe("binary/plain");
    expect(p.dataBytes).not.toBeNull();
    expect(p.dataUtf8).toBeNull();
    expect(p.warnings.some((w) => w.includes("binary/plain"))).toBe(true);
  });
  it("parses multiple payloads preserving order", () => {
    const doc = JSON.stringify({
      payloads: [
        { metadata: { encoding: JSON_PLAIN }, data: b64('"a"') },
        { metadata: { encoding: JSON_PLAIN }, data: b64('"b"') },
        { metadata: { encoding: JSON_PLAIN }, data: b64('"c"') },
      ],
    });
    const result = parsePayloadJson(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payloads.map((p) => p.dataUtf8)).toEqual(['"a"', '"b"', '"c"']);
    expect(result.payloads.map((p) => p.index)).toEqual([0, 1, 2]);
  });
  it("handles empty payloads array", () => {
    const result = parsePayloadJson(JSON.stringify({ payloads: [] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payloads).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("empty"))).toBe(true);
  });
  it("warns for unknown encoding without treating it as json/plain", () => {
    const doc = JSON.stringify({
      payloads: [{ metadata: { encoding: b64("application/x-custom") }, data: b64("hello") }],
    });
    const result = parsePayloadJson(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.payloads[0]!;
    expect(p.encoding).toBe("application/x-custom");
    expect(p.warnings.some((w) => w.includes("application/x-custom"))).toBe(true);
  });
  it("does not auto-decode arbitrary non-UTF-8 bytes", () => {
    const doc = JSON.stringify({
      payloads: [{ metadata: { encoding: JSON_PLAIN }, data: b64Bytes([0xff, 0xfe, 0xfd]) }],
    });
    const result = parsePayloadJson(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payloads[0]!.dataUtf8).toBeNull();
    expect(result.payloads[0]!.warnings.some((w) => w.includes("not valid UTF-8"))).toBe(true);
  });
});

describe("parsePayloadJson — malformed input", () => {
  it("rejects empty input", () => {
    const r = parsePayloadJson("   ");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/empty/i);
  });
  it("rejects invalid JSON", () => {
    const r = parsePayloadJson("{ not json");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/Invalid JSON/i);
  });
  it("rejects top-level array", () => {
    const r = parsePayloadJson("[]");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/object/i);
  });
  it("rejects missing payloads", () => {
    const r = parsePayloadJson("{}");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/payloads/);
  });
  it("rejects non-array payloads", () => {
    const r = parsePayloadJson('{"payloads": "nope"}');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/array/i);
  });
  it("rejects input exceeding the paste limit", () => {
    const r = parsePayloadJson("a".repeat(PASTE_LIMIT_BYTES + 1));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/paste limit/i);
  });
  it("never throws for arbitrary bad input", () => {
    for (const bad of [
      "", "null", "true", "42",
      '{"payloads": [null]}',
      '{"payloads": [{}]}',
      '{"payloads": [{"metadata": null, "data": null}]}',
    ]) {
      expect(() => parsePayloadJson(bad)).not.toThrow();
    }
  });
});

describe("parsePayloadJson — field-level problems", () => {
  it("warns when metadata is missing", () => {
    const r = parsePayloadJson(JSON.stringify({ payloads: [{ data: b64("x") }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payloads[0]!.warnings.some((w) => w.includes("metadata"))).toBe(true);
    expect(r.payloads[0]!.encoding).toBeNull();
  });
  it("warns when data is missing", () => {
    const r = parsePayloadJson(JSON.stringify({ payloads: [{ metadata: { encoding: JSON_PLAIN } }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payloads[0]!.warnings.some((w) => w.includes("data"))).toBe(true);
    expect(r.payloads[0]!.dataBytes).toBeNull();
  });
  it("warns when metadata.encoding is invalid base64", () => {
    const r = parsePayloadJson(JSON.stringify({ payloads: [{ metadata: { encoding: "!!!" }, data: b64("x") }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payloads[0]!.encoding).toBeNull();
    expect(r.payloads[0]!.warnings.some((w) => w.includes("not valid base64"))).toBe(true);
  });
  it("warns when data is invalid base64", () => {
    const r = parsePayloadJson(JSON.stringify({ payloads: [{ metadata: { encoding: JSON_PLAIN }, data: "!!!" }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payloads[0]!.dataBytes).toBeNull();
    expect(r.payloads[0]!.warnings.some((w) => w.includes("not valid base64"))).toBe(true);
  });
});

describe("buildInspectionReport", () => {
  it("produces a JSON string that round-trips", () => {
    const doc = JSON.stringify({
      payloads: [{ metadata: { encoding: JSON_PLAIN }, data: b64('"x"') }],
    });
    const report = buildInspectionReport(parsePayloadJson(doc));
    const roundTripped = JSON.parse(report);
    expect(roundTripped.ok).toBe(true);
    expect(roundTripped.payloads[0].encoding).toBe("json/plain");
  });
  it("includes the error for failed parses", () => {
    const report = buildInspectionReport(parsePayloadJson("not json"));
    const roundTripped = JSON.parse(report);
    expect(roundTripped.ok).toBe(false);
    expect(typeof roundTripped.error).toBe("string");
  });
});