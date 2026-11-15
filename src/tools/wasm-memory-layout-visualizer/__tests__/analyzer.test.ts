// src/tools/wasm-memory-layout-visualizer/__tests__/analyzer.test.ts

import { describe, it, expect } from "vitest";
import { parseWasmModule, type ParsedModule } from "../wasm-parser";
import {
  analyzeModule,
  analyzeModuleWithDiagnostics,
  type AnalysisWarning,
} from "../analyzer";

// ---------------------------------------------------------------------------
// Fixture builders (duplicated locally per task instructions)
// ---------------------------------------------------------------------------

function header(version = 1): number[] {
  return [
    0x00, 0x61, 0x73, 0x6d,
    version & 0xff,
    (version >> 8) & 0xff,
    (version >> 16) & 0xff,
    (version >> 24) & 0xff,
  ];
}

/**
 * Unsigned LEB128.
 * Used for section lengths, vector counts, indices, and memory min/max pages.
 * NOT suitable for i32.const / i64.const immediates, which use signed LEB128.
 */
function u32(n: number): number[] {
  const out: number[] = [];
  let v = n >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    out.push(b);
  } while (v !== 0);
  return out;
}

/**
 * Unsigned LEB128 for bigint.
 * Used for u64 immediates such as memory64 page counts.
 */
function u64(n: bigint): number[] {
  const out: number[] = [];
  let v = n;
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v !== 0n) b |= 0x80;
    out.push(b);
  } while (v !== 0n);
  return out;
}

/**
 * Signed LEB128 for a 32-bit integer.
 * Handles the full signed 32-bit range, including INT32_MIN and INT32_MAX.
 *
 * Algorithm (per the WebAssembly spec): emit 7-bit groups, sign-extending.
 * Termination rule: stop when either
 *   - the remaining value is 0 and bit 6 of the emitted byte is 0 (positive), or
 *   - the remaining value is -1 and bit 6 of the emitted byte is 1 (negative).
 */
function i32Signed(n: number): number[] {
  const out: number[] = [];
  let v = n | 0; // coerce to int32
  let more = true;
  while (more) {
    let b = v & 0x7f;
    // Arithmetic shift preserves sign for negative values.
    v >>= 7;
    if (
      (v === 0 && (b & 0x40) === 0) ||
      (v === -1 && (b & 0x40) !== 0)
    ) {
      more = false;
    } else {
      b |= 0x80;
    }
    out.push(b);
  }
  return out;
}

/**
 * Signed LEB128 for a 64-bit integer.
 * Used for i64.const immediates (e.g. i64 data offsets).
 */
function i64Signed(n: bigint): number[] {
  const out: number[] = [];
  let v = BigInt.asIntN(64, n);
  let more = true;
  while (more) {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (
      (v === 0n && (b & 0x40) === 0) ||
      (v === -1n && (b & 0x40) !== 0)
    ) {
      more = false;
    } else {
      b |= 0x80;
    }
    out.push(b);
  }
  return out;
}

function section(id: number, body: number[]): number[] {
  return [id, ...u32(body.length), ...body];
}

function name(s: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(s));
  return [...u32(bytes.length), ...bytes];
}

function build(bytes: number[]): ParsedModule {
  const result = parseWasmModule(new Uint8Array(bytes));
  if (!result.ok || !result.module) {
    throw new Error(
      `Fixture failed to parse: ${result.diagnostics
        .map((d) => d.message)
        .join("; ")}`
    );
  }
  return result.module;
}

// Empty module: header only
function emptyModule(): ParsedModule {
  return build([...header()]);
}

// One defined memory, min pages (LEB128), optional max pages (LEB128)
function definedMemoryModule(min = 1, max: number | null = null): ParsedModule {
  const minBytes = u32(min);
  const limits =
    max === null
      ? [0x00, ...minBytes]
      : [0x01, ...minBytes, ...u32(max)];
  return build([...header(), ...section(5, [...u32(1), ...limits])]);
}

// One imported memory, min pages (LEB128)
function importedMemoryModule(min = 1): ParsedModule {
  return build([
    ...header(),
    ...section(2, [
      ...u32(1),
      ...name("env"),
      ...name("memory"),
      0x02,
      0x00,
      ...u32(min),
    ]),
  ]);
}

// Memory64 defined memory, min page count given as BigInt (unsigned LEB128)
function memory64Module(pages: bigint): ParsedModule {
  return build([
    ...header(),
    ...section(5, [...u32(1), 0x04, ...u64(pages)]),
  ]);
}

// Two defined memories: mins 1 and 2
function multiMemoryModule(): ParsedModule {
  return build([
    ...header(),
    ...section(5, [...u32(2), 0x00, 1, 0x00, 2]),
  ]);
}

// Active data segment with i32.const offset into memory 0 (defined, min 1)
function activeI32Module(offset = 0, bytes: number[] = [0xaa]): ParsedModule {
  return build([
    ...header(),
    ...section(5, [...u32(1), 0x00, 1]),
    ...section(11, [
      ...u32(1),
      0x00, // flags=0, active, implicit memory 0
      0x41, ...i32Signed(offset), 0x0b,
      ...u32(bytes.length), ...bytes,
    ]),
  ]);
}

// Active data segment with i64.const offset
function activeI64Module(
  offset: bigint,
  bytes: number[] = [0xbb]
): ParsedModule {
  return build([
    ...header(),
    ...section(5, [...u32(1), 0x04, ...u64(1n)]), // memory64 memory, min 1
    ...section(11, [
      ...u32(1),
      0x00,
      0x42, ...i64Signed(offset), 0x0b,
      ...u32(bytes.length), ...bytes,
    ]),
  ]);
}

// Passive data segment
function passiveModule(): ParsedModule {
  return build([
    ...header(),
    ...section(11, [...u32(1), 0x01, ...u32(2), 0x78, 0x79]),
  ]);
}

// Active data segment with global.get offset
function globalOffsetModule(): ParsedModule {
  return build([
    ...header(),
    ...section(5, [...u32(1), 0x00, 1]),
    ...section(6, [
      ...u32(1),
      0x7f, 0x00,
      0x41, ...i32Signed(0), 0x0b,
    ]),
    ...section(11, [
      ...u32(1),
      0x00,
      0x23, 0x00, 0x0b,
      ...u32(1), 0xcc,
    ]),
  ]);
}

// Active data segment with explicit memory index 1
function explicitMemoryIndexModule(): ParsedModule {
  return build([
    ...header(),
    ...section(5, [...u32(2), 0x00, 1, 0x00, 1]),
    ...section(11, [
      ...u32(1),
      0x02,
      0x01,
      0x41, ...i32Signed(0), 0x0b,
      ...u32(1), 0xff,
    ]),
  ]);
}

// Two overlapping active segments in memory 0
function overlappingModule(): ParsedModule {
  return build([
    ...header(),
    ...section(5, [...u32(1), 0x00, 1]),
    ...section(11, [
      ...u32(2),
      // Segment 0: offset 0, length 10
      0x00, 0x41, ...i32Signed(0), 0x0b,
      ...u32(10), ...new Array(10).fill(0xaa),
      // Segment 1: offset 5, length 10
      0x00, 0x41, ...i32Signed(5), 0x0b,
      ...u32(10), ...new Array(10).fill(0xbb),
    ]),
  ]);
}

// Segment that exceeds defined memory's initial size:
// initial 1 page (65536 bytes), segment at 65530 length 10
function exceedsInitialModule(): ParsedModule {
  return build([
    ...header(),
    ...section(5, [...u32(1), 0x00, 1]),
    ...section(11, [
      ...u32(1),
      0x00, 0x41, ...i32Signed(65530), 0x0b,
      ...u32(10), ...new Array(10).fill(0xdd),
    ]),
  ]);
}

// Imported memory with active segment that exceeds its declared minimum
function importedMemoryActiveModule(): ParsedModule {
  return build([
    ...header(),
    ...section(2, [
      ...u32(1),
      ...name("env"),
      ...name("memory"),
      0x02,
      0x00,
      1,
    ]),
    ...section(11, [
      ...u32(1),
      0x00, 0x41, ...i32Signed(70000), 0x0b,
      ...u32(10), ...new Array(10).fill(0xee),
    ]),
  ]);
}

// Module with exported __stack_pointer / __stack_low / __stack_high
function stackPointerExportModule(): ParsedModule {
  return build([
    ...header(),
    ...section(5, [...u32(1), 0x00, 1]),
    ...section(6, [
      ...u32(3),
      // global 0: mutable i32 = 1024
      0x7f, 0x01, 0x41, ...i32Signed(1024), 0x0b,
      // global 1: immutable i32 = 512
      0x7f, 0x00, 0x41, ...i32Signed(512), 0x0b,
      // global 2: immutable i32 = 2048
      0x7f, 0x00, 0x41, ...i32Signed(2048), 0x0b,
    ]),
    ...section(7, [
      ...u32(3),
      ...name("__stack_pointer"), 0x03, 0x00,
      ...name("__stack_low"), 0x03, 0x01,
      ...name("__stack_high"), 0x03, 0x02,
    ]),
  ]);
}

// Module with exported __heap_base
function heapBaseExportModule(): ParsedModule {
  return build([
    ...header(),
    ...section(5, [...u32(1), 0x00, 1]),
    ...section(6, [
      ...u32(1),
      0x7f, 0x00,
      0x41, ...i32Signed(4096), 0x0b,
    ]),
    ...section(7, [...u32(1), ...name("__heap_base"), 0x03, 0x00]),
  ]);
}

// Module with imported __stack_pointer global
function importedStackPointerModule(): ParsedModule {
  return build([
    ...header(),
    ...section(2, [
      ...u32(1),
      ...name("env"),
      ...name("__stack_pointer"),
      0x03,
      0x7f,
      0x01,
    ]),
  ]);
}

// Module without any recognized global
function noGlobalsModule(): ParsedModule {
  return definedMemoryModule(1, null);
}

// ---------------------------------------------------------------------------
// Helpers used inside tests
// ---------------------------------------------------------------------------

// Note: `AnalysisWarning` is imported for type-only use in inline assertions
// and is referenced below where narrowing helps readability.
void (null as unknown as AnalysisWarning);

// ---------------------------------------------------------------------------
// Fixture self-tests (guards the helpers themselves)
// ---------------------------------------------------------------------------

describe("i32Signed helper", () => {
  // Encoding table from the WebAssembly spec, for representative values
  // across the full signed 32-bit range.
  const cases: Array<[number, number[]]> = [
    [0, [0x00]],
    [1, [0x01]],
    [-1, [0x7f]],
    [63, [0x3f]],
    [64, [0xc0, 0x00]],
    [100, [0xe4, 0x00]],
    [-64, [0x40]],
    [-65, [0xbf, 0x7f]],
    [127, [0xff, 0x00]],
    [128, [0x80, 0x01]],
    [-128, [0x80, 0x7f]],
    [-129, [0xff, 0x7e]],
    [2147483647, [0xff, 0xff, 0xff, 0xff, 0x07]],
    [-2147483648, [0x80, 0x80, 0x80, 0x80, 0x78]],
  ];

  for (const [value, expected] of cases) {
    it(`encodes ${value} as [${expected
      .map((b) => "0x" + b.toString(16))
      .join(", ")}]`, () => {
      expect(i32Signed(value)).toEqual(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("analyzeModule", () => {
  describe("module summary and empty modules", () => {
    it("produces an empty-memory report for a minimal valid module", () => {
      const report = analyzeModule(emptyModule());
      expect(report.module.memoryCount).toBe(0);
      expect(report.memories).toEqual([]);
      expect(report.dataSegments).toEqual([]);
      expect(report.regions).toEqual([]);
      expect(report.stack.stackPointer).toBeNull();
      expect(report.stack.heapBase).toBeNull();
    });
  });

  describe("memories", () => {
    it("analyzes a defined memory with page-to-byte conversion", () => {
      const report = analyzeModule(definedMemoryModule(2));
      expect(report.memories).toHaveLength(1);
      const m = report.memories[0]!;
      expect(m.index).toBe(0);
      expect(m.imported).toBe(false);
      expect(m.memory64).toBe(false);
      expect(m.shared).toBe(false);
      expect(m.initialPages.decimal).toBe("2");
      expect(m.initialSizeBytes.decimal).toBe("131072");
      expect(m.initialSizeBytes.hex).toBe("0x20000");
      expect(m.maximumPages).toBeNull();
      expect(m.maximumSizeBytes).toBeNull();
      expect(m.runtimeSizeKnown).toBe(false);
    });

    it("analyzes an imported memory with runtimeSizeKnown=false", () => {
      const report = analyzeModule(importedMemoryModule(1));
      expect(report.memories).toHaveLength(1);
      const m = report.memories[0]!;
      expect(m.imported).toBe(true);
      expect(m.runtimeSizeKnown).toBe(false);
      expect(m.initialSizeBytes.decimal).toBe("65536");
      expect(
        report.warnings.some(
          (w) => w.provenance === "imported-memory" && w.memoryIndex === 0
        )
      ).toBe(true);
    });

    it("handles Memory32 arithmetic beyond 32-bit page counts", () => {
      // 65536 pages is the memory32 maximum; 65536 * 65536 = 2^32 bytes.
      const report = analyzeModule(definedMemoryModule(65536, null));
      const m = report.memories[0]!;
      expect(m.initialPages.decimal).toBe("65536");
      expect(m.initialSizeBytes.decimal).toBe(
        (65536n * 65536n).toString()
      );
    });

    it("handles Memory64 values greater than Number.MAX_SAFE_INTEGER", () => {
      // 2^40 pages * 2^16 bytes = 2^56 bytes, well beyond MAX_SAFE_INTEGER.
      const pages = 1n << 40n;
      const report = analyzeModule(memory64Module(pages));
      const m = report.memories[0]!;
      expect(m.memory64).toBe(true);
      expect(m.initialPages.decimal).toBe(pages.toString());
      expect(m.initialSizeBytes.decimal).toBe((pages * 65536n).toString());
    });

    it("handles multiple memories with correct indices", () => {
      const report = analyzeModule(multiMemoryModule());
      expect(report.memories).toHaveLength(2);
      expect(report.memories[0]!.index).toBe(0);
      expect(report.memories[1]!.index).toBe(1);
    });

    it("reconstructs the unified memory index space when an import precedes a definition", () => {
      const mod = build([
        ...header(),
        ...section(2, [
          ...u32(1),
          ...name("env"),
          ...name("memory"),
          0x02,
          0x00,
          1,
        ]),
        ...section(5, [...u32(1), 0x00, 1]),
      ]);
      const report = analyzeModule(mod);
      expect(report.memories).toHaveLength(2);
      expect(report.memories[0]!.imported).toBe(true);
      expect(report.memories[0]!.index).toBe(0);
      expect(report.memories[1]!.imported).toBe(false);
      expect(report.memories[1]!.index).toBe(1);
    });
  });

  describe("data segments", () => {
    it("resolves an active i32.const segment start and end", () => {
      const report = analyzeModule(activeI32Module(16, [0x01, 0x02, 0x03]));
      const s = report.dataSegments[0]!;
      expect(s.mode).toBe("active");
      expect(s.memoryIndex).toBe(0);
      expect(s.byteLength).toBe(3);
      expect(s.startAddress!.decimal).toBe("16");
      expect(s.endAddress!.decimal).toBe("19");
      expect(s.boundsStatus).toBe("withinDeclaredInitial");
      expect(s.provenance).toBe("static-analysis");
    });

    it("regression: i32.const 100 resolves to 100, not a negative offset", () => {
      // The signed LEB128 encoding of 100 is [0xE4, 0x00], not [0x64].
      // If the fixture ever regresses to unsigned encoding, the parser
      // decodes [0x64] as -28, and the analyzer reports 4294967268.
      const report = analyzeModule(activeI32Module(100, [0x00]));
      const s = report.dataSegments[0]!;
      expect(s.startAddress!.decimal).toBe("100");
      expect(s.endAddress!.decimal).toBe("101");
      expect(s.boundsStatus).toBe("withinDeclaredInitial");
    });

    it("resolves an active i64.const segment with Memory64 arithmetic", () => {
      const offset = 1n << 40n; // > 2^32, forces BigInt path
      const report = analyzeModule(activeI64Module(offset, [0x42]));
      const s = report.dataSegments[0]!;
      expect(s.offsetExpression.kind).toBe("i64.const");
      expect(s.startAddress!.decimal).toBe(offset.toString());
      expect(s.endAddress!.decimal).toBe((offset + 1n).toString());
    });

    it("keeps a passive segment with null addresses", () => {
      const report = analyzeModule(passiveModule());
      const s = report.dataSegments[0]!;
      expect(s.mode).toBe("passive");
      expect(s.startAddress).toBeNull();
      expect(s.endAddress).toBeNull();
      expect(s.placementNote).toContain("memory.init");
      expect(s.boundsStatus).toBe("unresolved");
    });

    it("marks a global.get offset as unresolved with reason", () => {
      const report = analyzeModule(globalOffsetModule());
      const s = report.dataSegments[0]!;
      expect(s.startAddress).toBeNull();
      expect(s.offsetExpression.kind).toBe("global.get");
      expect(s.unresolvedReason).toContain("global");
      expect(s.boundsStatus).toBe("unresolved");
      expect(s.provenance).toBe("unresolved-expression");
    });

    it("respects explicit memory indices", () => {
      const report = analyzeModule(explicitMemoryIndexModule());
      const s = report.dataSegments[0]!;
      expect(s.memoryIndex).toBe(1);
      expect(s.startAddress!.decimal).toBe("0");
    });

    it("classifies a segment exceeding a defined memory's initial size", () => {
      const report = analyzeModule(exceedsInitialModule());
      const s = report.dataSegments[0]!;
      expect(s.boundsStatus).toBe("exceedsDeclaredMinimum");
      expect(
        report.warnings.some(
          (w) =>
            w.provenance === "declared-limits" &&
            w.segmentIndex === 0 &&
            w.message.includes("exceeds")
        )
      ).toBe(true);
    });

    it("does not mark an imported-memory segment as out of bounds even beyond its declared minimum", () => {
      const report = analyzeModule(importedMemoryActiveModule());
      const s = report.dataSegments[0]!;
      expect(s.boundsStatus).toBe("runtimeBoundsUnknown");
      expect(s.startAddress!.decimal).toBe("70000");
      expect(s.provenance).toBe("imported-memory");
      // Must not be classified as exceedsDeclaredMinimum
      expect(s.boundsStatus).not.toBe("exceedsDeclaredMinimum");
    });
  });

  describe("overlap detection", () => {
    it("reports overlapping segments in the same memory", () => {
      const report = analyzeModule(overlappingModule());
      const s0 = report.dataSegments[0]!;
      const s1 = report.dataSegments[1]!;
      expect(s0.overlapsWith).toContain(1);
      expect(s1.overlapsWith).toContain(0);
      expect(
        report.warnings.some(
          (w) =>
            w.message.includes("0") &&
            w.message.includes("1") &&
            w.message.includes("overlap")
        )
      ).toBe(true);
    });

    it("does not report overlap between segments in different memories", () => {
      const mod = build([
        ...header(),
        ...section(5, [...u32(2), 0x00, 1, 0x00, 1]),
        ...section(11, [
          ...u32(2),
          // Segment 0 in memory 0 at offset 0
          0x02, 0x00, 0x41, ...i32Signed(0), 0x0b,
          ...u32(10), ...new Array(10).fill(0x11),
          // Segment 1 in memory 1 at offset 0
          0x02, 0x01, 0x41, ...i32Signed(0), 0x0b,
          ...u32(10), ...new Array(10).fill(0x22),
        ]),
      ]);
      const report = analyzeModule(mod);
      expect(report.dataSegments[0]!.overlapsWith).toEqual([]);
      expect(report.dataSegments[1]!.overlapsWith).toEqual([]);
    });
  });

  describe("regions", () => {
    it("computes unclassified regions as the complement of active segments within initial size", () => {
      // Memory min 2 pages = 131072 bytes; segment at offset 100 length 10.
      const mod = build([
        ...header(),
        ...section(5, [...u32(1), 0x00, ...u32(2)]),
        ...section(11, [
          ...u32(1),
          0x00, 0x41, ...i32Signed(100), 0x0b,
          ...u32(10), ...new Array(10).fill(0x55),
        ]),
      ]);
      const report = analyzeModule(mod);
      expect(report.regions).toHaveLength(2);
      expect(report.regions[0]!.startAddress.decimal).toBe("0");
      expect(report.regions[0]!.endAddressExclusive.decimal).toBe("100");
      expect(report.regions[1]!.startAddress.decimal).toBe("110");
      expect(report.regions[1]!.endAddressExclusive.decimal).toBe("131072");
      expect(report.regions[0]!.label).toBe("unclassified");
    });

    it("handles overlapping intervals when computing unclassified regions", () => {
      const report = analyzeModule(overlappingModule());
      // Initial size 65536; two overlapping segments at [0,10) and [5,15)
      // merge to [0,15).
      expect(report.regions).toHaveLength(1);
      expect(report.regions[0]!.startAddress.decimal).toBe("15");
      expect(report.regions[0]!.endAddressExclusive.decimal).toBe("65536");
    });

    it("computes no regions for a zero-page memory", () => {
      const mod = build([
        ...header(),
        ...section(5, [...u32(1), 0x00, ...u32(0)]),
      ]);
      const report = analyzeModule(mod);
      expect(report.regions).toEqual([]);
    });
  });

  describe("globals and stack/heap metadata", () => {
    it("recognizes exported __stack_pointer, __stack_low, __stack_high", () => {
      const report = analyzeModule(stackPointerExportModule());
      expect(report.stack.stackPointer?.source).toBe("export");
      expect(report.stack.stackPointer?.exportedName).toBe(
        "__stack_pointer"
      );
      expect(report.stack.stackLow?.staticValue?.decimal).toBe("512");
      expect(report.stack.stackHigh?.staticValue?.decimal).toBe("2048");
      expect(report.stack.stackPointer?.staticValue?.decimal).toBe("1024");
      expect(report.stack.stackPointer?.runtimeValueKnown).toBe(false);
      expect(report.stack.confidence).toBe("high");
      // Computed initial gap: 1024 - 512 = 512
      expect(report.stack.computedStackSizeBytes?.decimal).toBe("512");
      expect(report.stack.evidence.length).toBeGreaterThan(0);
    });

    it("recognizes __heap_base as a static metadata value only", () => {
      const report = analyzeModule(heapBaseExportModule());
      expect(report.stack.heapBase?.source).toBe("export");
      expect(report.stack.heapBase?.staticValue?.decimal).toBe("4096");
      expect(report.stack.heapBase?.runtimeValueKnown).toBe(false);
      // Must not infer live heap
      expect(report.stack.computedStackSizeBytes).toBeNull();
    });

    it("distinguishes imported vs exported global provenance", () => {
      const report = analyzeModule(importedStackPointerModule());
      expect(report.stack.stackPointer?.source).toBe("import");
      expect(report.stack.stackPointer?.staticValue).toBeNull();
      expect(report.stack.confidence).toBe("low");
    });

    it("reports missing stack/heap metadata without inventing values", () => {
      const report = analyzeModule(noGlobalsModule());
      expect(report.stack.stackPointer).toBeNull();
      expect(report.stack.stackLow).toBeNull();
      expect(report.stack.stackHigh).toBeNull();
      expect(report.stack.heapBase).toBeNull();
      expect(report.stack.computedStackSizeBytes).toBeNull();
      expect(report.stack.confidence).toBe("low");
      expect(report.stack.notes.length).toBeGreaterThan(0);
    });

    it("does not falsely infer runtime stack pointer or live heap values", () => {
      const report = analyzeModule(stackPointerExportModule());
      // Static initial value may be present, but runtime values must be
      // marked unknown.
      expect(report.stack.stackPointer?.runtimeValueKnown).toBe(false);
      expect(report.stack.stackPointer?.staticValue).not.toBeNull();
      // Computed stack size must exist only as an initial gap, not a live
      // observation.
      expect(
        report.stack.notes.some((n) =>
          n.includes("not the live stack usage")
        )
      ).toBe(true);
    });
  });

  describe("BigInt-safe serialization", () => {
    it("produces a JSON-serializable report for large Memory64 values", () => {
      const pages = 1n << 40n;
      const report = analyzeModule(memory64Module(pages));
      const json = JSON.stringify(report);
      expect(json).toBeTypeOf("string");
      // No native bigint leaked: JSON.stringify would have thrown.
      const parsed = JSON.parse(json) as typeof report;
      expect(parsed.memories[0]!.initialSizeBytes.decimal).toBe(
        (pages * 65536n).toString()
      );
    });

    it("serializes segment addresses above Number.MAX_SAFE_INTEGER", () => {
      const offset = 1n << 50n; // 2^50
      const report = analyzeModule(activeI64Module(offset, [0x01, 0x02]));
      const json = JSON.stringify(report);
      const parsed = JSON.parse(json) as typeof report;
      expect(parsed.dataSegments[0]!.startAddress!.decimal).toBe(
        offset.toString()
      );
      expect(parsed.dataSegments[0]!.endAddress!.decimal).toBe(
        (offset + 2n).toString()
      );
    });
  });

  describe("parser diagnostics separation", () => {
    it("keeps parser diagnostics separate from analyzer warnings", () => {
      const mod = definedMemoryModule(1);
      const parserResult = parseWasmModule(new Uint8Array([0, 0, 0, 0])); // invalid
      const report = analyzeModuleWithDiagnostics(
        mod,
        parserResult.diagnostics
      );
      expect(report.parserDiagnostics.length).toBeGreaterThan(0);
      expect(report.provenance.parserDiagnosticCount).toBe(
        parserResult.diagnostics.length
      );
      // Analyzer warnings must not contain the parser's "Invalid WASM
      // magic" message.
      expect(
        report.warnings.some((w) => w.message.includes("magic"))
      ).toBe(false);
    });
  });

  describe("no false positives", () => {
    it("does not report overlaps for a module with a single segment", () => {
      const report = analyzeModule(activeI32Module(0, [0x01]));
      expect(report.dataSegments[0]!.overlapsWith).toEqual([]);
    });

    it("does not classify passive segments as out of bounds", () => {
      const report = analyzeModule(passiveModule());
      expect(report.dataSegments[0]!.boundsStatus).toBe("unresolved");
    });

    it("does not emit an imported-memory warning when no imported memory exists", () => {
      const report = analyzeModule(definedMemoryModule(1));
      expect(
        report.warnings.some((w) => w.provenance === "imported-memory")
      ).toBe(false);
    });
  });
});