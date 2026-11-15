// src/tools/wasm-memory-layout-visualizer/analyzer.ts

/**
 * Pure memory analysis engine for the WebAssembly Memory Layout Visualizer.
 * Consumes the exported ParsedModule from wasm-parser.ts. Does not parse bytes,
 * does not instantiate modules, does not touch React or the DOM.
 * All numeric output is JSON-safe (no native bigint in the report).
 */

import type {
  ParsedModule,
  ImportEntry,
  GlobalEntry,
  ExportEntry,
  DataSegment,
  ConstExpr,
  Diagnostic as ParserDiagnostic,
  MemoryLimits,
} from "./wasm-parser";

// ---------------------------------------------------------------------------
// Public report types
// ---------------------------------------------------------------------------

export interface SerializedInt {
  decimal: string;
  hex: string;
}

export type AnalysisSeverity = "info" | "warning" | "error";
export type AnalysisConfidence = "high" | "medium" | "low";
export type AnalysisProvenance =
  | "parser"
  | "declared-limits"
  | "static-analysis"
  | "imported-memory"
  | "unresolved-expression";

export interface AnalysisWarning {
  severity: AnalysisSeverity;
  confidence: AnalysisConfidence;
  provenance: AnalysisProvenance;
  message: string;
  memoryIndex?: number;
  segmentIndex?: number;
  globalIndex?: number;
}

export interface ModuleSummary {
  version: number;
  sectionCount: number;
  memoryCount: number;
  dataSegmentCount: number;
  exportCount: number;
  globalCount: number;
  importCount: number;
}

export interface MemoryAnalysis {
  index: number;
  imported: boolean;
  memory64: boolean;
  shared: boolean;
  initialPages: SerializedInt;
  maximumPages: SerializedInt | null;
  initialSizeBytes: SerializedInt;
  maximumSizeBytes: SerializedInt | null;
  runtimeSizeKnown: false;
}

export type SegmentBoundsStatus =
  | "withinDeclaredInitial"
  | "exceedsDeclaredMinimum"
  | "runtimeBoundsUnknown"
  | "unresolved";

export interface SegmentAnalysis {
  index: number;
  mode: "active" | "passive";
  memoryIndex: number | null;
  byteLength: number;
  startAddress: SerializedInt | null;
  endAddress: SerializedInt | null;
  offsetExpression:
    | { kind: "i32.const"; value: SerializedInt }
    | { kind: "i64.const"; value: SerializedInt }
    | { kind: "global.get"; globalIndex: number; resolved: false }
    | { kind: "unsupported" };
  unresolvedReason: string | null;
  boundsStatus: SegmentBoundsStatus;
  overlapsWith: number[];
  placementNote: string | null;
  provenance: AnalysisProvenance;
}

export interface GlobalMetadata {
  name: string;
  source: "export" | "import";
  globalIndex: number;
  exportedName: string;
  staticValue: SerializedInt | null;
  staticValueKind: "i32.const" | "i64.const" | null;
  mutability: boolean | null;
  runtimeValueKnown: false;
}

export interface StackMetadata {
  stackPointer: GlobalMetadata | null;
  stackLow: GlobalMetadata | null;
  stackHigh: GlobalMetadata | null;
  heapBase: GlobalMetadata | null;
  computedStackSizeBytes: SerializedInt | null;
  evidence: string[];
  confidence: AnalysisConfidence;
  notes: string[];
}

export interface Region {
  memoryIndex: number;
  startAddress: SerializedInt;
  endAddressExclusive: SerializedInt;
  sizeBytes: SerializedInt;
  label: "unclassified";
  note: string;
}

export interface Provenance {
  analyzer: "chifral-wasm-memory-analyzer";
  parserDiagnosticCount: number;
  notes: string[];
}

export interface MemoryAnalysisReport {
  module: ModuleSummary;
  memories: MemoryAnalysis[];
  dataSegments: SegmentAnalysis[];
  globals: GlobalMetadata[];
  stack: StackMetadata;
  regions: Region[];
  warnings: AnalysisWarning[];
  parserDiagnostics: ParserDiagnostic[];
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 65536n;
const U32_MASK = 0xffffffffn;

function serializeInt(v: bigint): SerializedInt {
  return {
    decimal: v.toString(10),
    hex: "0x" + v.toString(16),
  };
}

function serializeBigIntValue(v: { value: bigint }): SerializedInt {
  return serializeInt(v.value);
}

function addWarning(warnings: AnalysisWarning[], w: AnalysisWarning): void {
  warnings.push(w);
}

function describeConstExpr(e: ConstExpr): SegmentAnalysis["offsetExpression"] {
  switch (e.kind) {
    case "i32.const":
      return { kind: "i32.const", value: serializeInt(BigInt(e.value >>> 0)) };
    case "i64.const":
      return { kind: "i64.const", value: serializeBigIntValue(e.value) };
    case "global.get":
      return { kind: "global.get", globalIndex: e.index, resolved: false };
    case "unsupported":
      return { kind: "unsupported" };
  }
}

function resolveConstOffset(e: ConstExpr): bigint | null {
  switch (e.kind) {
    case "i32.const":
      // Unsigned interpretation of i32 address
      return BigInt(e.value >>> 0);
    case "i64.const":
      // i64 addresses are treated as unsigned 64-bit
      return BigInt.asUintN(64, e.value.value);
    case "global.get":
    case "unsupported":
      return null;
  }
}

function unresolvedReasonFor(e: ConstExpr): string | null {
  switch (e.kind) {
    case "global.get":
      return `Offset uses global.get (global ${e.index}); the global's runtime value is not known during static analysis.`;
    case "unsupported":
      return "Offset expression is not one of the constant forms the parser recognises.";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Memory index reconstruction (Option A)
// ---------------------------------------------------------------------------

interface UnifiedMemory {
  index: number;
  imported: boolean;
  limits: MemoryLimits;
}

function buildUnifiedMemoryList(
  module: ParsedModule,
  warnings: AnalysisWarning[]
): UnifiedMemory[] {
  const memoryImports = module.imports.filter(
    (i): i is ImportEntry & { limits: MemoryLimits } =>
      i.kind === "memory" && i.limits !== undefined
  );

  const unified: UnifiedMemory[] = [];

  memoryImports.forEach((imp, i) => {
    unified.push({ index: i, imported: true, limits: imp.limits });
  });

  const k = memoryImports.length;

  module.memories.forEach((mem, position) => {
    const expected = k + position;
    if (mem.index !== expected) {
      addWarning(warnings, {
        severity: "error",
        confidence: "high",
        provenance: "static-analysis",
        message: `Memory index mismatch: defined memory at position ${position} has index ${mem.index}, expected ${expected} (${k} imported + ${position}). The parser's index arithmetic may have changed. Not renumbering.`,
        memoryIndex: mem.index,
      });
    }
    unified.push({ index: mem.index, imported: mem.imported, limits: mem.limits });
  });

  return unified;
}

// ---------------------------------------------------------------------------
// Memory analysis
// ---------------------------------------------------------------------------

function analyzeMemory(
  mem: UnifiedMemory,
  warnings: AnalysisWarning[]
): MemoryAnalysis {
  const initial = mem.limits.initial.value;
  const maximum = mem.limits.maximum?.value ?? null;

  const initialSizeBytes = initial * PAGE_SIZE;
  const maximumSizeBytes = maximum !== null ? maximum * PAGE_SIZE : null;

  if (mem.imported) {
    addWarning(warnings, {
      severity: "info",
      confidence: "high",
      provenance: "imported-memory",
      message: `Memory ${mem.index} is imported. Its runtime size is unknown; only the declared minimum is available.`,
      memoryIndex: mem.index,
    });
  }

  return {
    index: mem.index,
    imported: mem.imported,
    memory64: mem.limits.memory64,
    shared: mem.limits.shared,
    initialPages: serializeInt(initial),
    maximumPages: maximum !== null ? serializeInt(maximum) : null,
    initialSizeBytes: serializeInt(initialSizeBytes),
    maximumSizeBytes:
      maximumSizeBytes !== null ? serializeInt(maximumSizeBytes) : null,
    runtimeSizeKnown: false,
  };
}

// ---------------------------------------------------------------------------
// Data segment analysis
// ---------------------------------------------------------------------------

interface ResolvedSegment {
  index: number;
  memoryIndex: number;
  start: bigint;
  endExclusive: bigint;
}

function analyzeSegment(
  seg: DataSegment,
  memoriesByIndex: Map<number, MemoryAnalysis>,
  warnings: AnalysisWarning[]
): SegmentAnalysis {
  const base: SegmentAnalysis = {
    index: seg.index,
    mode: seg.mode.kind === "active" ? "active" : "passive",
    memoryIndex: null,
    byteLength: seg.byteLength,
    startAddress: null,
    endAddress: null,
    offsetExpression: { kind: "unsupported" },
    unresolvedReason: null,
    boundsStatus: "unresolved",
    overlapsWith: [],
    placementNote: null,
    provenance: "static-analysis",
  };

  if (seg.mode.kind === "passive") {
    base.placementNote =
      "Passive segment. Runtime placement occurs via memory.init or related instructions; its target address is not known statically.";
    return base;
  }

  // Active
  base.memoryIndex = seg.mode.memoryIndex;
  base.offsetExpression = describeConstExpr(seg.mode.offset);

  const offset = resolveConstOffset(seg.mode.offset);
  if (offset === null) {
    base.unresolvedReason = unresolvedReasonFor(seg.mode.offset);
    base.boundsStatus = "unresolved";
    base.provenance = "unresolved-expression";
    addWarning(warnings, {
      severity: "info",
      confidence: "high",
      provenance: "unresolved-expression",
      message: `Data segment ${seg.index} offset cannot be resolved statically. ${base.unresolvedReason ?? ""}`.trim(),
      memoryIndex: seg.mode.memoryIndex,
      segmentIndex: seg.index,
    });
    return base;
  }

  const length = BigInt(seg.byteLength);
  const endExclusive = offset + length;

  base.startAddress = serializeInt(offset);
  base.endAddress = serializeInt(endExclusive);

  const mem = memoriesByIndex.get(seg.mode.memoryIndex);

  if (!mem) {
    base.boundsStatus = "runtimeBoundsUnknown";
    addWarning(warnings, {
      severity: "warning",
      confidence: "medium",
      provenance: "static-analysis",
      message: `Data segment ${seg.index} targets memory ${seg.mode.memoryIndex}, but no such memory is declared. Bounds cannot be classified.`,
      segmentIndex: seg.index,
      memoryIndex: seg.mode.memoryIndex,
    });
    return base;
  }

  if (mem.imported) {
    base.boundsStatus = "runtimeBoundsUnknown";
    base.provenance = "imported-memory";
    addWarning(warnings, {
      severity: "warning",
      confidence: "medium",
      provenance: "imported-memory",
      message: `Data segment ${seg.index} targets imported memory ${mem.index}. The imported memory may be larger than its declared minimum; the segment is not classified as out of bounds.`,
      memoryIndex: mem.index,
      segmentIndex: seg.index,
    });
    return base;
  }

  // Defined memory: compare against declared initial size in bytes
  const initialBytes = BigInt(mem.initialSizeBytes.decimal);
  if (endExclusive <= initialBytes) {
    base.boundsStatus = "withinDeclaredInitial";
  } else {
    base.boundsStatus = "exceedsDeclaredMinimum";
    addWarning(warnings, {
      severity: "warning",
      confidence: "high",
      provenance: "declared-limits",
      message: `Data segment ${seg.index} end (0x${endExclusive.toString(16)}) exceeds the defined memory ${mem.index}'s declared initial size (0x${initialBytes.toString(16)}). At instantiation the segment cannot fit within the initial memory.`,
      memoryIndex: mem.index,
      segmentIndex: seg.index,
    });
  }

  return base;
}

function computeResolvedSegments(
  segments: SegmentAnalysis[]
): ResolvedSegment[] {
  const out: ResolvedSegment[] = [];
  for (const s of segments) {
    if (
      s.mode === "active" &&
      s.memoryIndex !== null &&
      s.startAddress !== null &&
      s.endAddress !== null
    ) {
      out.push({
        index: s.index,
        memoryIndex: s.memoryIndex,
        start: BigInt(s.startAddress.decimal),
        endExclusive: BigInt(s.endAddress.decimal),
      });
    }
  }
  return out;
}

function detectOverlaps(
  resolved: ResolvedSegment[],
  segmentsByIndex: Map<number, SegmentAnalysis>,
  warnings: AnalysisWarning[]
): void {
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const a = resolved[i];
      const b = resolved[j];
      if (!a || !b) continue;
      if (a.memoryIndex !== b.memoryIndex) continue;
      const overlapStart = a.start > b.start ? a.start : b.start;
      const overlapEnd = a.endExclusive < b.endExclusive ? a.endExclusive : b.endExclusive;
      if (overlapStart < overlapEnd) {
        const segA = segmentsByIndex.get(a.index);
        const segB = segmentsByIndex.get(b.index);
        if (segA && !segA.overlapsWith.includes(b.index)) {
          segA.overlapsWith.push(b.index);
          segA.overlapsWith.sort((x, y) => x - y);
        }
        if (segB && !segB.overlapsWith.includes(a.index)) {
          segB.overlapsWith.push(a.index);
          segB.overlapsWith.sort((x, y) => x - y);
        }
        addWarning(warnings, {
          severity: "warning",
          confidence: "high",
          provenance: "static-analysis",
          message: `Data segments ${a.index} and ${b.index} overlap in memory ${a.memoryIndex} between 0x${overlapStart.toString(16)} and 0x${overlapEnd.toString(16)}.`,
          memoryIndex: a.memoryIndex,
          segmentIndex: a.index,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Unclassified regions
// ---------------------------------------------------------------------------

interface Interval {
  start: bigint;
  endExclusive: bigint;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) =>
    a.start < b.start ? -1 : a.start > b.start ? 1 : 0
  );
  const first = sorted[0];
  if (!first) return [];
  const out: Interval[] = [first];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (!cur || !last) continue;
    if (cur.start <= last.endExclusive) {
      if (cur.endExclusive > last.endExclusive) {
        last.endExclusive = cur.endExclusive;
      }
    } else {
      out.push(cur);
    }
  }
  return out;
}

function computeRegions(
  memories: MemoryAnalysis[],
  resolved: ResolvedSegment[]
): Region[] {
  const regions: Region[] = [];

  for (const mem of memories) {
    const limit = BigInt(mem.initialSizeBytes.decimal);
    if (limit === 0n) continue;

    const occupied = resolved
      .filter((s) => s.memoryIndex === mem.index)
      .map((s): Interval => {
        // Clip to [0, limit) so the complement is well-defined
        const start = s.start < 0n ? 0n : s.start > limit ? limit : s.start;
        const endExclusive =
          s.endExclusive < 0n ? 0n : s.endExclusive > limit ? limit : s.endExclusive;
        return { start, endExclusive };
      })
      .filter((iv) => iv.start < iv.endExclusive);

    const merged = mergeIntervals(occupied);

    let cursor = 0n;
    const gaps: Interval[] = [];
    for (const iv of merged) {
      if (cursor < iv.start) {
        gaps.push({ start: cursor, endExclusive: iv.start });
      }
      if (iv.endExclusive > cursor) cursor = iv.endExclusive;
    }
    if (cursor < limit) {
      gaps.push({ start: cursor, endExclusive: limit });
    }

    for (const g of gaps) {
      regions.push({
        memoryIndex: mem.index,
        startAddress: serializeInt(g.start),
        endAddressExclusive: serializeInt(g.endExclusive),
        sizeBytes: serializeInt(g.endExclusive - g.start),
        label: "unclassified",
        note: "Not covered by any statically resolvable active data segment. May contain zero-initialized memory, runtime structures, or other contents the analyzer cannot identify. This is not proof that the region is free or unused.",
      });
    }
  }

  return regions;
}

// ---------------------------------------------------------------------------
// Global / stack / heap metadata
// ---------------------------------------------------------------------------

const RECOGNIZED_GLOBAL_NAMES = new Set([
  "__stack_pointer",
  "__stack_low",
  "__stack_high",
  "__heap_base",
]);

function staticValueOfGlobal(
  g: GlobalEntry | null
): { value: SerializedInt | null; kind: "i32.const" | "i64.const" | null } {
  if (!g) return { value: null, kind: null };
  switch (g.initExpr.kind) {
    case "i32.const":
      return { value: serializeInt(BigInt(g.initExpr.value >>> 0)), kind: "i32.const" };
    case "i64.const":
      return { value: serializeBigIntValue(g.initExpr.value), kind: "i64.const" };
    default:
      return { value: null, kind: null };
  }
}

interface FoundGlobal {
  metadata: GlobalMetadata;
  // For stack-size computation only
  staticNumeric: bigint | null;
}

function findRecognizedGlobals(
  module: ParsedModule,
  warnings: AnalysisWarning[]
): FoundGlobal[] {
  const found: FoundGlobal[] = [];

  // Exported globals: match by export name
  for (const exp of module.exports) {
    if (exp.kind !== "global") continue;
    if (!RECOGNIZED_GLOBAL_NAMES.has(exp.name)) continue;

    const g = module.globals.find((gg) => gg.index === exp.index) ?? null;
    const sv = staticValueOfGlobal(g);

    if (!g) {
      addWarning(warnings, {
        severity: "warning",
        confidence: "medium",
        provenance: "static-analysis",
        message: `Export "${exp.name}" refers to global ${exp.index}, but no global definition is present in the parsed module.`,
        globalIndex: exp.index,
      });
    }

    found.push({
      metadata: {
        name: exp.name,
        source: "export",
        globalIndex: exp.index,
        exportedName: exp.name,
        staticValue: sv.value,
        staticValueKind: sv.kind,
        mutability: g ? g.mutable : null,
        runtimeValueKnown: false,
      },
      staticNumeric: sv.value ? BigInt(sv.value.decimal) : null,
    });
  }

  // Imported globals: match by import name
  for (const imp of module.imports) {
    if (imp.kind !== "global") continue;
    if (!RECOGNIZED_GLOBAL_NAMES.has(imp.name)) continue;

    // Imported globals have no initExpr; static value is unknown
    found.push({
      metadata: {
        name: imp.name,
        source: "import",
        globalIndex: imp.index,
        exportedName: imp.name,
        staticValue: null,
        staticValueKind: null,
        mutability: imp.globalType ? imp.globalType.mutable : null,
        runtimeValueKnown: false,
      },
      staticNumeric: null,
    });
  }

  return found;
}

function computeStackMetadata(
  found: FoundGlobal[],
  warnings: AnalysisWarning[]
): StackMetadata {
  const byName = (n: string): FoundGlobal | undefined =>
    found.find((f) => f.metadata.name === n);

  const sp = byName("__stack_pointer") ?? null;
  const low = byName("__stack_low") ?? null;
  const high = byName("__stack_high") ?? null;
  const heap = byName("__heap_base") ?? null;

  const evidence: string[] = [];
  const notes: string[] = [];

  if (sp) evidence.push(`Found ${sp.metadata.source === "export" ? "exported" : "imported"} global "${sp.metadata.name}".`);
  if (low) evidence.push(`Found ${low.metadata.source === "export" ? "exported" : "imported"} global "${low.metadata.name}".`);
  if (high) evidence.push(`Found ${high.metadata.source === "export" ? "exported" : "imported"} global "${high.metadata.name}".`);
  if (heap) evidence.push(`Found ${heap.metadata.source === "export" ? "exported" : "imported"} global "${heap.metadata.name}".`);

  let computedStackSizeBytes: SerializedInt | null = null;

  if (!sp && !low && !high && !heap) {
    notes.push(
      "No stack or heap metadata globals were found. This may be a hand-written module, a non-LLVM toolchain, or a module that uses mangled names the analyzer does not recognise."
    );
  } else {
    notes.push(
      "Static initial values reflect the module's declared initializers, not the current runtime values. The stack pointer changes at runtime."
    );
  }

  if (sp && (low || high)) {
    const spVal = sp.staticNumeric;
    const lowVal = low?.staticNumeric ?? null;
    const highVal = high?.staticNumeric ?? null;
    if (lowVal !== null && spVal !== null && spVal >= lowVal) {
      computedStackSizeBytes = serializeInt(spVal - lowVal);
      notes.push(
        `Computed size from __stack_pointer initial value minus __stack_low initial value. This is the initial stack gap, not the live stack usage.`
      );
    } else if (highVal !== null && spVal !== null && highVal >= spVal) {
      computedStackSizeBytes = serializeInt(highVal - spVal);
      notes.push(
        `Computed size from __stack_high initial value minus __stack_pointer initial value. This is the initial stack gap, not the live stack usage.`
      );
    } else {
      notes.push(
        "A stack pointer and at least one bound were found, but their initial values do not yield a non-negative size. Not computing a stack size."
      );
    }
  } else if (sp && !low && !high) {
    notes.push(
      "Only __stack_pointer was found. Without __stack_low or __stack_high the initial stack size cannot be computed."
    );
  }

  let confidence: AnalysisConfidence;
  if (low || high) {
    confidence = "high";
  } else if (sp) {
    confidence = "medium";
  } else if (heap) {
    confidence = "low";
  } else {
    confidence = "low";
  }

  if (sp && sp.metadata.staticValue === null) {
    notes.push("__stack_pointer has no statically resolvable initializer; its initial value is unknown.");
    confidence = "low";
  }

  return {
    stackPointer: sp ? sp.metadata : null,
    stackLow: low ? low.metadata : null,
    stackHigh: high ? high.metadata : null,
    heapBase: heap ? heap.metadata : null,
    computedStackSizeBytes,
    evidence,
    confidence,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function analyzeModule(module: ParsedModule): MemoryAnalysisReport {
  const warnings: AnalysisWarning[] = [];

  const unified = buildUnifiedMemoryList(module, warnings);
  const memories = unified.map((m) => analyzeMemory(m, warnings));

  const memoriesByIndex = new Map<number, MemoryAnalysis>();
  for (const m of memories) memoriesByIndex.set(m.index, m);

  const dataSegments = module.dataSegments.map((seg) =>
    analyzeSegment(seg, memoriesByIndex, warnings)
  );

  const segmentIndexMap = new Map<number, SegmentAnalysis>();
  for (const s of dataSegments) segmentIndexMap.set(s.index, s);

  const resolved = computeResolvedSegments(dataSegments);
  detectOverlaps(resolved, segmentIndexMap, warnings);

  const regions = computeRegions(memories, resolved);

  const foundGlobals = findRecognizedGlobals(module, warnings);
  const globals = foundGlobals.map((f) => f.metadata);
  const stack = computeStackMetadata(foundGlobals, warnings);

  const moduleSummary: ModuleSummary = {
    version: module.header.version,
    sectionCount: module.sections.length,
    memoryCount: memories.length,
    dataSegmentCount: module.dataSegments.length,
    exportCount: module.exports.length,
    globalCount: module.globals.length,
    importCount: module.imports.length,
  };

  const provenance: Provenance = {
    analyzer: "chifral-wasm-memory-analyzer",
    parserDiagnosticCount: 0,
    notes: [
      "All addresses and sizes are reported as decimal and hexadecimal strings; native bigint values are not placed in the report.",
      "Runtime memory sizes, live stack pointer values, and live heap allocations are not inferred from static parsing.",
      "Unclassified regions are not free memory; they are regions the analyzer cannot classify.",
    ],
  };

  return {
    module: moduleSummary,
    memories,
    dataSegments,
    globals,
    stack,
    regions,
    warnings,
    parserDiagnostics: [],
    provenance,
  };
}

/**
 * Convenience overload for consumers that already hold the parser's diagnostics.
 * Keeps parser diagnostics strictly separate from analyzer warnings.
 */
export function analyzeModuleWithDiagnostics(
  module: ParsedModule,
  parserDiagnostics: ParserDiagnostic[]
): MemoryAnalysisReport {
  const report = analyzeModule(module);
  return {
    ...report,
    parserDiagnostics,
    provenance: {
      ...report.provenance,
      parserDiagnosticCount: parserDiagnostics.length,
    },
  };
}