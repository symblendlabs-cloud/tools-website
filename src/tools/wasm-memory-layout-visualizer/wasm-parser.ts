// src/tools/wasm-memory-layout-visualizer/wasm-parser.ts

/**
 * Standalone, deterministic WebAssembly binary parser.
 * Never executes or instantiates uploaded modules.
 * All reads are bounds-checked. Malformed input produces structured diagnostics.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BigIntValue {
  value: bigint;
  decimal: string;
  hex: string;
}

export type DiagnosticSeverity = "error" | "warning" | "unsupported";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  offset: number;
}

export interface WasmHeader {
  magic: number[];
  version: number;
}

export interface SectionInfo {
  id: number;
  name: string;
  offset: number;
  size: number;
  endOffset: number;
}

export interface FuncType {
  params: number[];
  results: number[];
}

export interface ImportEntry {
  module: string;
  name: string;
  kind: "func" | "table" | "memory" | "global" | "tag";
  index: number;
  typeIndex?: number;
  limits?: MemoryLimits;
  globalType?: { valueType: number; mutable: boolean };
}

export interface ExportEntry {
  name: string;
  kind: "func" | "table" | "memory" | "global" | "tag";
  index: number;
}

export interface MemoryLimits {
  memory64: boolean;
  shared: boolean;
  initial: BigIntValue;
  maximum: BigIntValue | null;
  pageSize: 65536;
  initialBytes: BigIntValue;
  maximumBytes: BigIntValue | null;
}

export interface MemoryEntry {
  index: number;
  imported: boolean;
  limits: MemoryLimits;
}

export interface GlobalEntry {
  index: number;
  valueType: number;
  mutable: boolean;
  initExpr: ConstExpr;
}

export type ConstExpr =
  | { kind: "i32.const"; value: number }
  | { kind: "i64.const"; value: BigIntValue }
  | { kind: "global.get"; index: number; resolved: false }
  | { kind: "unsupported"; raw: number[] };

export type DataSegmentMode =
  | { kind: "passive" }
  | { kind: "active"; memoryIndex: number; offset: ConstExpr };

export interface DataSegment {
  index: number;
  mode: DataSegmentMode;
  byteLength: number;
  bytes: number[];
}

export interface ElementSegmentMode {
  kind: "active" | "passive" | "declarative";
  tableIndex?: number;
  offset?: ConstExpr;
}

export interface ElementSegment {
  index: number;
  mode: ElementSegmentMode;
  usesExpressions: boolean;
  elementCount: number;
}

export interface CustomSection {
  name: string;
  offset: number;
  size: number;
}

export interface ParsedModule {
  header: WasmHeader;
  sections: SectionInfo[];
  types: FuncType[];
  imports: ImportEntry[];
  functionTypeIndices: number[];
  memories: MemoryEntry[];
  globals: GlobalEntry[];
  exports: ExportEntry[];
  dataSegments: DataSegment[];
  elementSegments: ElementSegment[];
  customSections: CustomSection[];
  dataCount: number | null;
}

export interface ParseResult {
  ok: boolean;
  module: ParsedModule | null;
  diagnostics: Diagnostic[];
}

// ---------------------------------------------------------------------------
// Internal constants and helpers
// ---------------------------------------------------------------------------

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];
const WASM_VERSION = 1;

const SECTION_NAMES: Record<number, string> = {
  0: "custom",
  1: "type",
  2: "import",
  3: "function",
  4: "table",
  5: "memory",
  6: "global",
  7: "export",
  8: "start",
  9: "element",
  10: "code",
  11: "data",
  12: "data-count",
  13: "tag",
};

const MAX_PAGES_MEMORY32 = 65536n;
const MAX_PAGES_MEMORY64 = 1n << 48n;
const PAGE_SIZE = 65536n;

const MAX_VECTOR_COUNT = 1_000_000;
const MAX_LEB_BYTES_U32 = 5;
const MAX_LEB_BYTES_U64 = 10;
const MAX_SECTION_SIZE = 100 * 1024 * 1024; // 100 MB safety limit

function makeBigIntValue(v: bigint): BigIntValue {
  return {
    value: v,
    decimal: v.toString(10),
    hex: "0x" + v.toString(16),
  };
}

function u32ToBigIntValue(v: number): BigIntValue {
  return makeBigIntValue(BigInt(v));
}

// ---------------------------------------------------------------------------
// BinaryReader
// ---------------------------------------------------------------------------

class BinaryReader {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  offset: number;
  readonly length: number;
  readonly diagnostics: Diagnostic[];

  constructor(bytes: Uint8Array, diagnostics: Diagnostic[]) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = 0;
    this.length = bytes.length;
    this.diagnostics = diagnostics;
  }

  remaining(): number {
    return this.length - this.offset;
  }

  eof(): boolean {
    return this.offset >= this.length;
  }

  private fail(message: string): never {
    this.diagnostics.push({ severity: "error", message, offset: this.offset });
    throw new ParseAbort();
  }

  readU8(): number {
    if (this.offset >= this.length) {
      this.fail("Unexpected end of input while reading byte");
    }
    return this.bytes[this.offset++]!;
  }

  peekU8(): number {
    if (this.offset >= this.length) {
      this.fail("Unexpected end of input while peeking byte");
    }
    return this.bytes[this.offset]!;
  }

  readBytes(count: number): Uint8Array {
    if (count < 0) {
      this.fail("Negative byte count");
    }
    if (this.offset + count > this.length) {
      this.fail(
        `Unexpected end of input: need ${count} bytes, have ${this.length - this.offset}`
      );
    }
    const slice = this.bytes.subarray(this.offset, this.offset + count);
    this.offset += count;
    return slice;
  }

  skip(count: number): void {
    if (count < 0) {
      this.fail("Negative skip count");
    }
    if (this.offset + count > this.length) {
      this.fail(
        `Cannot skip ${count} bytes: only ${this.length - this.offset} remaining`
      );
    }
    this.offset += count;
  }

  readVarU32(): number {
    let result = 0;
    let shift = 0;
    for (let i = 0; i < MAX_LEB_BYTES_U32; i++) {
      const b = this.readU8();
      const low = b & 0x7f;
      if (i === 4 && (low & 0xf0) !== 0) {
        this.fail("Unsigned LEB128 u32 overflow");
      }
      result |= low << shift;
      if ((b & 0x80) === 0) {
        return result >>> 0;
      }
      shift += 7;
    }
    this.fail("Unsigned LEB128 u32 too long");
  }

  readVarU64(): bigint {
    let result = 0n;
    let shift = 0n;
    for (let i = 0; i < MAX_LEB_BYTES_U64; i++) {
      const b = this.readU8();
      const low = BigInt(b & 0x7f);
      if (i === 9 && (b & 0x7e) !== 0) {
        this.fail("Unsigned LEB128 u64 overflow");
      }
      result |= low << shift;
      if ((b & 0x80) === 0) {
        return BigInt.asUintN(64, result);
      }
      shift += 7n;
    }
    this.fail("Unsigned LEB128 u64 too long");
  }

  readVarI32(): number {
    let result = 0;
    let shift = 0;
    let b: number;
    let count = 0;
    do {
      b = this.readU8();
      count++;
      if (count > MAX_LEB_BYTES_U32) {
        this.fail("Signed LEB128 i32 too long");
      }
      result |= (b & 0x7f) << shift;
      shift += 7;
    } while ((b & 0x80) !== 0);
    if (shift < 32 && (b & 0x40) !== 0) {
      result |= ~0 << shift;
    }
    return result | 0;
  }

  readVarI64(): bigint {
    let result = 0n;
    let shift = 0n;
    let b: number;
    let count = 0;
    do {
      b = this.readU8();
      count++;
      if (count > MAX_LEB_BYTES_U64) {
        this.fail("Signed LEB128 i64 too long");
      }
      result |= BigInt(b & 0x7f) << shift;
      shift += 7n;
    } while ((b & 0x80) !== 0);
    if (shift < 64n && (b & 0x40) !== 0) {
      result |= (~0n) << shift;
    }
    return BigInt.asIntN(64, result);
  }

  readName(): string {
    const len = this.readVarU32();
    if (len > this.remaining()) {
      this.fail(`Name length ${len} exceeds remaining ${this.remaining()}`);
    }
    const bytes = this.readBytes(len);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      this.fail("Invalid UTF-8 in name");
    }
  }
}

class ParseAbort extends Error {}

// ---------------------------------------------------------------------------
// Section parsers
// ---------------------------------------------------------------------------

function readLimits(
  reader: BinaryReader,
  diagnostics: Diagnostic[],
  isMemory: boolean
): MemoryLimits | null {
  const flags = reader.readU8();

  const hasMax = (flags & 0x01) !== 0;
  const shared = (flags & 0x02) !== 0;
  const memory64 = (flags & 0x04) !== 0;

  if (!isMemory && (shared || memory64)) {
    diagnostics.push({
      severity: "error",
      message: "Shared or memory64 flags are only valid for memory limits",
      offset: reader.offset - 1,
    });
    return null;
  }

  // Reject undefined flag combinations (bits 3-7 set)
  if ((flags & 0xf8) !== 0) {
    diagnostics.push({
      severity: "unsupported",
      message: `Unsupported limits flag 0x${flags.toString(16)}`,
      offset: reader.offset - 1,
    });
    return null;
  }

  // Shared memory must have a maximum
  if (shared && !hasMax) {
    diagnostics.push({
      severity: "error",
      message: "Shared memory requires a maximum",
      offset: reader.offset - 1,
    });
    return null;
  }

  const readSize = memory64
    ? () => reader.readVarU64()
    : () => BigInt(reader.readVarU32());

  const initial = readSize();
  const maximum = hasMax ? readSize() : null;

  // Validate page bounds
  const maxAllowed = memory64 ? MAX_PAGES_MEMORY64 : MAX_PAGES_MEMORY32;
  if (initial > maxAllowed) {
    diagnostics.push({
      severity: "error",
      message: `Initial pages ${initial} exceed maximum ${maxAllowed}`,
      offset: reader.offset,
    });
    return null;
  }
  if (maximum !== null && maximum > maxAllowed) {
    diagnostics.push({
      severity: "error",
      message: `Maximum pages ${maximum} exceed maximum ${maxAllowed}`,
      offset: reader.offset,
    });
    return null;
  }
  if (maximum !== null && initial > maximum) {
    diagnostics.push({
      severity: "error",
      message: `Initial pages ${initial} exceed maximum ${maximum}`,
      offset: reader.offset,
    });
    return null;
  }

  return {
    memory64,
    shared,
    initial: makeBigIntValue(initial),
    maximum: maximum !== null ? makeBigIntValue(maximum) : null,
    pageSize: 65536,
    initialBytes: makeBigIntValue(initial * PAGE_SIZE),
    maximumBytes: maximum !== null ? makeBigIntValue(maximum * PAGE_SIZE) : null,
  };
}

function parseConstExpr(reader: BinaryReader): ConstExpr {
  const opcode = reader.readU8();
  switch (opcode) {
    case 0x41: {
      const v = reader.readVarI32();
      reader.readU8(); // end
      return { kind: "i32.const", value: v };
    }
    case 0x42: {
      const v = reader.readVarI64();
      reader.readU8(); // end
      return { kind: "i64.const", value: makeBigIntValue(v) };
    }
    case 0x23: {
      const idx = reader.readVarU32();
      reader.readU8(); // end
      return { kind: "global.get", index: idx, resolved: false };
    }
    default: {
      // Skip until end opcode for unsupported expressions
      const raw = [opcode];
      while (true) {
        const b = reader.readU8();
        raw.push(b);
        if (b === 0x0b) break;
      }
      return { kind: "unsupported", raw };
    }
  }
}

function parseTypeSection(
  reader: BinaryReader,
  diagnostics: Diagnostic[]
): FuncType[] {
  const count = reader.readVarU32();
  if (count > MAX_VECTOR_COUNT || count > reader.remaining()) {
    diagnostics.push({
      severity: "error",
      message: `Type section count ${count} exceeds limit or remaining bytes`,
      offset: reader.offset,
    });
    return [];
  }
  const types: FuncType[] = [];
  for (let i = 0; i < count; i++) {
    const form = reader.readU8();
    if (form !== 0x60) {
      diagnostics.push({
        severity: "unsupported",
        message: `Unsupported type form 0x${form.toString(16)}`,
        offset: reader.offset - 1,
      });
      return types;
    }
    const paramCount = reader.readVarU32();
    const params: number[] = [];
    for (let j = 0; j < paramCount; j++) {
      params.push(reader.readU8());
    }
    const resultCount = reader.readVarU32();
    const results: number[] = [];
    for (let j = 0; j < resultCount; j++) {
      results.push(reader.readU8());
    }
    types.push({ params, results });
  }
  return types;
}

function parseImportSection(
  reader: BinaryReader,
  diagnostics: Diagnostic[]
): ImportEntry[] {
  const count = reader.readVarU32();
  if (count > MAX_VECTOR_COUNT || count > reader.remaining()) {
    diagnostics.push({
      severity: "error",
      message: `Import count ${count} exceeds limit`,
      offset: reader.offset,
    });
    return [];
  }
  const imports: ImportEntry[] = [];
  let memoryIndex = 0;
  for (let i = 0; i < count; i++) {
    const module = reader.readName();
    const name = reader.readName();
    const kindByte = reader.readU8();
    switch (kindByte) {
      case 0x00: {
        const typeIndex = reader.readVarU32();
        imports.push({ module, name, kind: "func", index: i, typeIndex });
        break;
      }
      case 0x01: {
        reader.readU8(); // elemtype
        readLimits(reader, diagnostics, false);
        imports.push({ module, name, kind: "table", index: i });
        break;
      }
      case 0x02: {
        const limits = readLimits(reader, diagnostics, true);
        if (limits) {
          imports.push({
            module,
            name,
            kind: "memory",
            index: memoryIndex++,
            limits,
          });
        }
        break;
      }
      case 0x03: {
        const valueType = reader.readU8();
        const mutByte = reader.readU8();
        imports.push({
          module,
          name,
          kind: "global",
          index: i,
          globalType: { valueType, mutable: mutByte === 1 },
        });
        break;
      }
      default:
        diagnostics.push({
          severity: "unsupported",
          message: `Unsupported import kind 0x${kindByte.toString(16)}`,
          offset: reader.offset - 1,
        });
        return imports;
    }
  }
  return imports;
}

function parseFunctionSection(
  reader: BinaryReader,
  diagnostics: Diagnostic[]
): number[] {
  const count = reader.readVarU32();
  if (count > MAX_VECTOR_COUNT || count > reader.remaining()) {
    diagnostics.push({
      severity: "error",
      message: `Function count ${count} exceeds limit`,
      offset: reader.offset,
    });
    return [];
  }
  const indices: number[] = [];
  for (let i = 0; i < count; i++) {
    indices.push(reader.readVarU32());
  }
  return indices;
}

function parseMemorySection(
  reader: BinaryReader,
  diagnostics: Diagnostic[],
  startIndex: number
): MemoryEntry[] {
  const count = reader.readVarU32();
  if (count > MAX_VECTOR_COUNT || count > reader.remaining()) {
    diagnostics.push({
      severity: "error",
      message: `Memory count ${count} exceeds limit`,
      offset: reader.offset,
    });
    return [];
  }
  const memories: MemoryEntry[] = [];
  for (let i = 0; i < count; i++) {
    const limits = readLimits(reader, diagnostics, true);
    if (limits) {
      memories.push({ index: startIndex + i, imported: false, limits });
    }
  }
  return memories;
}

function parseGlobalSection(
  reader: BinaryReader,
  diagnostics: Diagnostic[]
): GlobalEntry[] {
  const count = reader.readVarU32();
  if (count > MAX_VECTOR_COUNT || count > reader.remaining()) {
    diagnostics.push({
      severity: "error",
      message: `Global count ${count} exceeds limit`,
      offset: reader.offset,
    });
    return [];
  }
  const globals: GlobalEntry[] = [];
  for (let i = 0; i < count; i++) {
    const valueType = reader.readU8();
    const mutByte = reader.readU8();
    const initExpr = parseConstExpr(reader);
    globals.push({
      index: i,
      valueType,
      mutable: mutByte === 1,
      initExpr,
    });
  }
  return globals;
}

function parseExportSection(
  reader: BinaryReader,
  diagnostics: Diagnostic[]
): ExportEntry[] {
  const count = reader.readVarU32();
  if (count > MAX_VECTOR_COUNT || count > reader.remaining()) {
    diagnostics.push({
      severity: "error",
      message: `Export count ${count} exceeds limit`,
      offset: reader.offset,
    });
    return [];
  }
  const exports: ExportEntry[] = [];
  for (let i = 0; i < count; i++) {
    const name = reader.readName();
    const kindByte = reader.readU8();
    const index = reader.readVarU32();
    let kind: ExportEntry["kind"];
    switch (kindByte) {
      case 0x00: kind = "func"; break;
      case 0x01: kind = "table"; break;
      case 0x02: kind = "memory"; break;
      case 0x03: kind = "global"; break;
      case 0x04: kind = "tag"; break;
      default:
        diagnostics.push({
          severity: "unsupported",
          message: `Unsupported export kind 0x${kindByte.toString(16)}`,
          offset: reader.offset - 2,
        });
        continue;
    }
    exports.push({ name, kind, index });
  }
  return exports;
}

function parseElementSection(
  reader: BinaryReader,
  diagnostics: Diagnostic[]
): ElementSegment[] {
  const count = reader.readVarU32();
  if (count > MAX_VECTOR_COUNT || count > reader.remaining()) {
    diagnostics.push({
      severity: "error",
      message: `Element count ${count} exceeds limit`,
      offset: reader.offset,
    });
    return [];
  }
  const segments: ElementSegment[] = [];
  for (let i = 0; i < count; i++) {
    const flags = reader.readU8();

    if ((flags & 0xf8) !== 0) {
      diagnostics.push({
        severity: "unsupported",
        message: `Unsupported element flags 0x${flags.toString(16)}`,
        offset: reader.offset - 1,
      });
      return segments;
    }

    const isPassiveOrDeclarative = (flags & 0x01) !== 0;
    const hasTableIndex = (flags & 0x02) !== 0;
    const usesExpressions = (flags & 0x04) !== 0;

    let mode: ElementSegmentMode;
    if (!isPassiveOrDeclarative) {
      // Active
      const tableIndex = hasTableIndex ? reader.readVarU32() : 0;
      const offset = parseConstExpr(reader);
      mode = { kind: "active", tableIndex, offset };
    } else if (hasTableIndex) {
      // Declarative (flags 0x03, 0x07)
      mode = { kind: "declarative" };
    } else {
      // Passive (flags 0x01, 0x05)
      mode = { kind: "passive" };
    }

    // Skip element type / initializer bytes
    // For simplicity and structural correctness, read count and skip entries
    if (flags === 0x00 || flags === 0x04 || flags === 0x02 || flags === 0x06) {
      // For flags 0x00: elemkind (0x00) then vec(funcidx)
      // For flags 0x04: elemkind (0x00) then vec(expr)
      // For flags 0x02: tableidx, offset, elemkind, vec(funcidx)
      // For flags 0x06: tableidx, offset, elemkind, vec(expr)
      if (!hasTableIndex) {
        const elemKind = reader.readU8();
        if (elemKind !== 0x00) {
          diagnostics.push({
            severity: "unsupported",
            message: `Unsupported element kind 0x${elemKind.toString(16)}`,
            offset: reader.offset - 1,
          });
        }
      } else {
        // table index already read; read elemkind
        const elemKind = reader.readU8();
        if (elemKind !== 0x00) {
          diagnostics.push({
            severity: "unsupported",
            message: `Unsupported element kind 0x${elemKind.toString(16)}`,
            offset: reader.offset - 1,
          });
        }
      }
    }

    const elemCount = reader.readVarU32();
    const elementCount = elemCount;

    if (usesExpressions) {
      // Skip expressions (each is an init_expr ending with end)
      for (let j = 0; j < elemCount; j++) {
        skipConstExpr(reader);
      }
    } else {
      // Skip function indices
      for (let j = 0; j < elemCount; j++) {
        reader.readVarU32();
      }
    }

    segments.push({ index: i, mode, usesExpressions, elementCount });
  }
  return segments;
}

function skipConstExpr(reader: BinaryReader): void {
  // Read opcodes until end (0x0b)
  // This is a simplified skip; full validation would need opcode knowledge.
  let depth = 0;
  while (true) {
    const b = reader.readU8();
    if (b === 0x0b) {
      if (depth === 0) return;
      depth--;
    } else if (b === 0x41 || b === 0x42 || b === 0x23) {
      // i32.const / i64.const / global.get: read immediate
      if (b === 0x41) reader.readVarI32();
      else if (b === 0x42) reader.readVarI64();
      else reader.readVarU32();
    } else {
      // Unsupported opcode inside expression; consume until end
      // This may be imprecise but prevents infinite loops.
    }
  }
}

function parseDataSection(
  reader: BinaryReader,
  diagnostics: Diagnostic[],
  memoryCount: number
): DataSegment[] {
  const count = reader.readVarU32();
  if (count > MAX_VECTOR_COUNT || count > reader.remaining()) {
    diagnostics.push({
      severity: "error",
      message: `Data segment count ${count} exceeds limit`,
      offset: reader.offset,
    });
    return [];
  }
  const segments: DataSegment[] = [];
  for (let i = 0; i < count; i++) {
    const flags = reader.readVarU32();

    if (flags > 2) {
      diagnostics.push({
        severity: "unsupported",
        message: `Unsupported data segment flags ${flags}`,
        offset: reader.offset,
      });
      return segments;
    }

    const isPassive = (flags & 0x01) !== 0;
    const hasMemoryIndex = (flags & 0x02) !== 0;

    let mode: DataSegmentMode;
    if (isPassive) {
      mode = { kind: "passive" };
    } else {
      const memoryIndex = hasMemoryIndex ? reader.readVarU32() : 0;
      if (memoryIndex >= memoryCount) {
        diagnostics.push({
          severity: "error",
          message: `Data segment memory index ${memoryIndex} out of range (${memoryCount} memories)`,
          offset: reader.offset,
        });
      }
      const offset = parseConstExpr(reader);
      mode = { kind: "active", memoryIndex, offset };
    }

    const byteLen = reader.readVarU32();
    if (byteLen > reader.remaining()) {
      diagnostics.push({
        severity: "error",
        message: `Data segment byte length ${byteLen} exceeds remaining ${reader.remaining()}`,
        offset: reader.offset,
      });
      return segments;
    }
    const bytes = Array.from(reader.readBytes(byteLen));
    segments.push({ index: i, mode, byteLength: byteLen, bytes });
  }
  return segments;
}

function parseCustomSection(
  reader: BinaryReader,
  sectionOffset: number,
  sectionSize: number
): CustomSection | null {
  const start = reader.offset;
  try {
    const name = reader.readName();
    return {
      name,
      offset: sectionOffset,
      size: sectionSize,
    };
  } catch {
    reader.offset = start + sectionSize;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseWasmModule(bytes: Uint8Array): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const reader = new BinaryReader(bytes, diagnostics);

  // --- Header ---
  try {
    if (bytes.length < 4) {
      diagnostics.push({
        severity: "error",
        message: "Input too short for WASM magic (need 4 bytes)",
        offset: 0,
      });
      return { ok: false, module: null, diagnostics };
    }
    for (let i = 0; i < 4; i++) {
      if (bytes[i] !== WASM_MAGIC[i]) {
        const expected = WASM_MAGIC[i]!;
        const actual = bytes[i]!;
        diagnostics.push({
          severity: "error",
          message: `Invalid WASM magic at offset ${i}: expected 0x${expected.toString(16)}, got 0x${actual.toString(16)}`,
          offset: i,
        });
        return { ok: false, module: null, diagnostics };
      }
    }
    reader.skip(4);

    if (bytes.length < 8) {
      diagnostics.push({
        severity: "error",
        message: "Input too short for WASM version (need 4 more bytes)",
        offset: 4,
      });
      return { ok: false, module: null, diagnostics };
    }
    const version =
      bytes[4]! | (bytes[5]! << 8) | (bytes[6]! << 16) | (bytes[7]! << 24);
    reader.skip(4);

    if (version !== WASM_VERSION) {
      diagnostics.push({
        severity: "unsupported",
        message: `Unsupported WASM version ${version} (expected ${WASM_VERSION})`,
        offset: 4,
      });
      return { ok: false, module: null, diagnostics };
    }

    // --- Section loop ---
    const sections: SectionInfo[] = [];
    const types: FuncType[] = [];
    const imports: ImportEntry[] = [];
    const functionTypeIndices: number[] = [];
    const memories: MemoryEntry[] = [];
    const globals: GlobalEntry[] = [];
    const exports: ExportEntry[] = [];
    const dataSegments: DataSegment[] = [];
    const elementSegments: ElementSegment[] = [];
    const customSections: CustomSection[] = [];
    let dataCount: number | null = null;

    let highestSectionId = 0;
    let totalMemoryCount = 0;

    while (!reader.eof()) {
      const sectionStart = reader.offset;
      const sectionId = reader.readU8();

      // Check section ordering (custom sections exempt)
      if (sectionId !== 0) {
        if (sectionId < highestSectionId) {
          diagnostics.push({
            severity: "warning",
            message: `Section ${sectionId} (${SECTION_NAMES[sectionId] ?? "unknown"}) appears after section ${highestSectionId}; out of order`,
            offset: sectionStart,
          });
        }
        highestSectionId = Math.max(highestSectionId, sectionId);
      }

      const sectionSize = reader.readVarU32();
      if (sectionSize > MAX_SECTION_SIZE) {
        diagnostics.push({
          severity: "error",
          message: `Section size ${sectionSize} exceeds safety limit ${MAX_SECTION_SIZE}`,
          offset: sectionStart + 1,
        });
        break;
      }
      if (sectionSize > reader.remaining()) {
        diagnostics.push({
          severity: "error",
          message: `Section ${sectionId} size ${sectionSize} exceeds remaining ${reader.remaining()}`,
          offset: sectionStart + 1,
        });
        break;
      }

      const sectionEnd = reader.offset + sectionSize;

      sections.push({
        id: sectionId,
        name: SECTION_NAMES[sectionId] ?? "unknown",
        offset: sectionStart,
        size: sectionSize,
        endOffset: sectionEnd,
      });

      switch (sectionId) {
        case 0: {
          const custom = parseCustomSection(reader, sectionStart, sectionSize);
          if (custom) customSections.push(custom);
          reader.offset = sectionEnd;
          break;
        }
        case 1:
          types.push(...parseTypeSection(reader, diagnostics));
          break;
        case 2: {
          const imps = parseImportSection(reader, diagnostics);
          imports.push(...imps);
          for (const imp of imps) {
            if (imp.kind === "memory") totalMemoryCount++;
          }
          break;
        }
        case 3:
          functionTypeIndices.push(...parseFunctionSection(reader, diagnostics));
          break;
        case 4:
          // Table section: skip for now (structural only)
          reader.skip(sectionSize - (reader.offset - (sectionEnd - sectionSize)));
          break;
        case 5: {
          const mems = parseMemorySection(reader, diagnostics, totalMemoryCount);
          memories.push(...mems);
          totalMemoryCount += mems.length;
          break;
        }
        case 6:
          globals.push(...parseGlobalSection(reader, diagnostics));
          break;
        case 7:
          exports.push(...parseExportSection(reader, diagnostics));
          break;
        case 9:
          elementSegments.push(...parseElementSection(reader, diagnostics));
          break;
        case 10:
          // Code section: skip structurally
          reader.skip(sectionSize - (reader.offset - (sectionEnd - sectionSize)));
          break;
        case 11:
          dataSegments.push(...parseDataSection(reader, diagnostics, totalMemoryCount));
          break;
        case 12:
          dataCount = reader.readVarU32();
          break;
        default:
          diagnostics.push({
            severity: "unsupported",
            message: `Unknown section id ${sectionId} at offset ${sectionStart}; skipping ${sectionSize} bytes`,
            offset: sectionStart,
          });
          reader.offset = sectionEnd;
      }

      // Ensure we end exactly at sectionEnd
      if (reader.offset > sectionEnd) {
        diagnostics.push({
          severity: "error",
          message: `Section ${sectionId} parser read past declared end (${reader.offset} > ${sectionEnd})`,
          offset: sectionStart,
        });
        break;
      }
      reader.offset = sectionEnd;
    }

    const module: ParsedModule = {
      header: { magic: WASM_MAGIC, version },
      sections,
      types,
      imports,
      functionTypeIndices,
      memories,
      globals,
      exports,
      dataSegments,
      elementSegments,
      customSections,
      dataCount,
    };

    const hasErrors = diagnostics.some((d) => d.severity === "error");
    return { ok: !hasErrors, module: hasErrors ? null : module, diagnostics };
  } catch (e) {
    if (e instanceof ParseAbort) {
      return { ok: false, module: null, diagnostics };
    }
    diagnostics.push({
      severity: "error",
      message: `Unexpected parser failure: ${e instanceof Error ? e.message : String(e)}`,
      offset: reader.offset,
    });
    return { ok: false, module: null, diagnostics };
  }
}