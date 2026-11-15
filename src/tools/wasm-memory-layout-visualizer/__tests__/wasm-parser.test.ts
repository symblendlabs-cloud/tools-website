// src/tools/wasm-memory-layout-visualizer/__tests__/wasm-parser.test.ts

import { describe, it, expect } from "vitest";
import { parseWasmModule } from "../wasm-parser";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function header(version = 1): number[] {
  return [0x00, 0x61, 0x73, 0x6d, version & 0xff, (version >> 8) & 0xff, (version >> 16) & 0xff, (version >> 24) & 0xff];
}

function u32(n: number): number[] {
  const out: number[] = [];
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n !== 0) b |= 0x80;
    out.push(b);
  } while (n !== 0);
  return out;
}

function u64(n: bigint): number[] {
  const out: number[] = [];
  do {
    let b = Number(n & 0x7fn);
    n >>= 7n;
    if (n !== 0n) b |= 0x80;
    out.push(b);
  } while (n !== 0n);
  return out;
}

function section(id: number, body: number[]): number[] {
  return [id, ...u32(body.length), ...body];
}

function vec<T>(items: T[]): number[] {
  return [...u32(items.length), ...items.flat() as number[]];
}

function name(s: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(s));
  return [...u32(bytes.length), ...bytes];
}

// Minimal valid module: header + empty type section
function minimalModule(): Uint8Array {
  return new Uint8Array([...header(), ...section(1, [...u32(0)])]);
}

// Module with one defined memory (min 1, no max)
function definedMemoryModule(): Uint8Array {
  return new Uint8Array([
    ...header(),
    ...section(5, [...u32(1), 0x00, 1]), // flags=0x00 (i32, no max), min=1
  ]);
}

// Module with imported memory (min 1, no max)
function importedMemoryModule(): Uint8Array {
  return new Uint8Array([
    ...header(),
    ...section(2, [
      ...u32(1),
      ...name("env"),
      ...name("memory"),
      0x02, // memory import
      0x00, // flags: i32, no max
      1, // min pages
    ]),
  ]);
}

// Module with active data segment (flags=0, implicit memory 0)
function activeDataModule(): Uint8Array {
  return new Uint8Array([
    ...header(),
    ...section(5, [...u32(1), 0x00, 1]), // one memory, min 1
    ...section(11, [
      ...u32(1),
      0x00, // flags=0: active, implicit memory 0
      0x41, 0x00, 0x0b, // i32.const 0, end
      ...u32(3), 0x61, 0x62, 0x63, // 3 bytes "abc"
    ]),
  ]);
}

// Module with passive data segment (flags=1)
function passiveDataModule(): Uint8Array {
  return new Uint8Array([
    ...header(),
    ...section(11, [
      ...u32(1),
      0x01, // flags=1: passive
      ...u32(2), 0x78, 0x79, // 2 bytes "xy"
    ]),
  ]);
}

// Module with custom section
function customSectionModule(): Uint8Array {
  const customBody = [...name("test"), 0x01, 0x02, 0x03];
  return new Uint8Array([...header(), ...section(0, customBody)]);
}

// Module with Memory64 limits (flags=0x04: i64, no max)
function memory64Module(): Uint8Array {
  return new Uint8Array([
    ...header(),
    ...section(5, [...u32(1), 0x04, ...u64(1n)]), // flags=0x04, min=1 (u64)
  ]);
}

// Module with two memories (multi-memory)
function multiMemoryModule(): Uint8Array {
  return new Uint8Array([
    ...header(),
    ...section(5, [
      ...u32(2),
      0x00, 1, // memory 0: min 1
      0x00, 2, // memory 1: min 2
    ]),
  ]);
}

// Module with shared memory (flags=0x03: shared + max)
function sharedMemoryModule(): Uint8Array {
  return new Uint8Array([
    ...header(),
    ...section(5, [...u32(1), 0x03, 1, 2]), // flags=0x03, min=1, max=2
  ]);
}

// Module with active data segment using explicit memory index (flags=2)
function activeDataExplicitMemoryModule(): Uint8Array {
  return new Uint8Array([
    ...header(),
    ...section(5, [...u32(2), 0x00, 1, 0x00, 1]), // two memories
    ...section(11, [
      ...u32(1),
      0x02, // flags=2: active, explicit memory index
      0x01, // memory index 1
      0x41, 0x00, 0x0b, // i32.const 0, end
      ...u32(1), 0xff,
    ]),
  ]);
}

// Module with global.get offset in data segment
function globalOffsetDataModule(): Uint8Array {
  return new Uint8Array([
    ...header(),
    ...section(5, [...u32(1), 0x00, 1]),
    ...section(6, [
      ...u32(1),
      0x7f, 0x00, // i32, immutable
      0x41, 0x00, 0x0b, // init: i32.const 0
    ]),
    ...section(11, [
      ...u32(1),
      0x00, // active, implicit memory 0
      0x23, 0x00, 0x0b, // global.get 0, end
      ...u32(1), 0xaa,
    ]),
  ]);
}

// Module with element segment (active, flags=0)
function activeElementModule(): Uint8Array {
  return new Uint8Array([
    ...header(),
    ...section(4, [...u32(1), 0x70, 0x00, 0]), // one funcref table
    ...section(9, [
      ...u32(1),
      0x00, // flags=0: active, table 0, funcidx vec
      0x41, 0x00, 0x0b, // offset: i32.const 0
      ...u32(1), 0x00, // one function index 0
    ]),
  ]);
}

// Module with passive element segment (flags=1)
function passiveElementModule(): Uint8Array {
  return new Uint8Array([
    ...header(),
    ...section(9, [
      ...u32(1),
      0x01, // flags=1: passive, elemkind + funcidx vec
      0x00, // elemkind: funcref
      ...u32(1), 0x00, // one function index
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WASM parser", () => {
  describe("header validation", () => {
    it("accepts a valid minimal module", () => {
      const result = parseWasmModule(minimalModule());
      expect(result.ok).toBe(true);
      expect(result.module).not.toBeNull();
      expect(result.module!.header.version).toBe(1);
    });

    it("rejects invalid magic", () => {
      const bad = new Uint8Array([0x01, 0x02, 0x03, 0x04, 1, 0, 0, 0]);
      const result = parseWasmModule(bad);
      expect(result.ok).toBe(false);
      expect(result.diagnostics.some((d) => d.message.includes("magic"))).toBe(true);
    });

    it("rejects unsupported version", () => {
      const bad = new Uint8Array([...header(2)]);
      const result = parseWasmModule(bad);
      expect(result.ok).toBe(false);
      expect(result.diagnostics.some((d) => d.message.includes("version"))).toBe(true);
    });

    it("rejects truncated header", () => {
      const bad = new Uint8Array([0x00, 0x61, 0x73]);
      const result = parseWasmModule(bad);
      expect(result.ok).toBe(false);
    });
  });

  describe("section bounds", () => {
    it("rejects a section whose size exceeds remaining bytes", () => {
      const bad = new Uint8Array([
        ...header(),
        0x01, // section id
        0x7f, // size = 127 (but no body follows)
      ]);
      const result = parseWasmModule(bad);
      expect(result.ok).toBe(false);
      expect(result.diagnostics.some((d) => d.message.includes("exceeds remaining"))).toBe(true);
    });

    it("rejects a truncated section body", () => {
      const bad = new Uint8Array([
        ...header(),
        0x01, 0x02, 0x00, // section id 1, size 2, but only one byte body
      ]);
      const result = parseWasmModule(bad);
      expect(result.ok).toBe(false);
    });

    it("warns on out-of-order sections", () => {
      const bad = new Uint8Array([
        ...header(),
        ...section(3, [...u32(0)]), // function section first
        ...section(1, [...u32(0)]), // type section after (out of order)
      ]);
      const result = parseWasmModule(bad);
      expect(result.diagnostics.some((d) => d.message.includes("out of order"))).toBe(true);
    });
  });

  describe("LEB128", () => {
    it("rejects malformed unsigned LEB128 (too long)", () => {
      // Section size encoded with 6 bytes (invalid for u32)
      const bad = new Uint8Array([
        ...header(),
        0x01, 0x80, 0x80, 0x80, 0x80, 0x80, 0x00, // 6-byte LEB
      ]);
      const result = parseWasmModule(bad);
      expect(result.ok).toBe(false);
    });

    it("decodes valid multi-byte unsigned LEB128", () => {
      // Section size 128 encoded as 0x80 0x01
      const body = new Array(128).fill(0);
      const bytes = new Uint8Array([
        ...header(),
        0x01, 0x80, 0x01, ...body,
      ]);
      const result = parseWasmModule(bytes);
      // No error from LEB decoding itself; may fail on type section content
      expect(result.diagnostics.some((d) => d.message.includes("LEB"))).toBe(false);
    });
  });

  describe("memories", () => {
    it("parses a defined memory (i32, min 1)", () => {
      const result = parseWasmModule(definedMemoryModule());
      expect(result.ok).toBe(true);
      expect(result.module!.memories).toHaveLength(1);
      const mem = result.module!.memories[0]!;
      expect(mem.imported).toBe(false);
      expect(mem.limits.memory64).toBe(false);
      expect(mem.limits.shared).toBe(false);
      expect(mem.limits.initial.value).toBe(1n);
      expect(mem.limits.initialBytes.value).toBe(65536n);
    });

    it("parses an imported memory", () => {
      const result = parseWasmModule(importedMemoryModule());
      expect(result.ok).toBe(true);
      expect(result.module!.imports).toHaveLength(1);
      // The parser tracks imported memories in the import entry's limits
      expect(result.module!.imports[0]!.kind).toBe("memory");
      expect(result.module!.imports[0]!.limits).toBeDefined();
      expect(result.module!.imports[0]!.limits!.initial.value).toBe(1n);
    });

    it("parses Memory64 limits (flags=0x04)", () => {
      const result = parseWasmModule(memory64Module());
      expect(result.ok).toBe(true);
      expect(result.module!.memories).toHaveLength(1);
      const mem = result.module!.memories[0]!;
      expect(mem.limits.memory64).toBe(true);
      expect(mem.limits.initial.value).toBe(1n);
    });

    it("parses multi-memory module", () => {
      const result = parseWasmModule(multiMemoryModule());
      expect(result.ok).toBe(true);
      expect(result.module!.memories).toHaveLength(2);
      expect(result.module!.memories[0]!.index).toBe(0);
      expect(result.module!.memories[1]!.index).toBe(1);
    });

    it("parses shared memory with maximum", () => {
      const result = parseWasmModule(sharedMemoryModule());
      expect(result.ok).toBe(true);
      const mem = result.module!.memories[0]!;
      expect(mem.limits.shared).toBe(true);
      expect(mem.limits.maximum).not.toBeNull();
      expect(mem.limits.maximum!.value).toBe(2n);
    });

    it("rejects shared memory without maximum", () => {
      const bad = new Uint8Array([
        ...header(),
        ...section(5, [...u32(1), 0x02, 1]), // flags=0x02 (shared, no max), min=1
      ]);
      const result = parseWasmModule(bad);
      expect(result.ok).toBe(false);
      expect(result.diagnostics.some((d) => d.message.includes("Shared memory requires a maximum"))).toBe(true);
    });

    it("rejects initial pages exceeding maximum", () => {
      const bad = new Uint8Array([
        ...header(),
        ...section(5, [...u32(1), 0x01, 5, 3]), // min=5, max=3 (invalid)
      ]);
      const result = parseWasmModule(bad);
      expect(result.ok).toBe(false);
      expect(result.diagnostics.some((d) => d.message.includes("exceed maximum"))).toBe(true);
    });
  });

  describe("data segments", () => {
    it("parses an active data segment (flags=0, implicit memory 0)", () => {
      const result = parseWasmModule(activeDataModule());
      expect(result.ok).toBe(true);
      expect(result.module!.dataSegments).toHaveLength(1);
      const seg = result.module!.dataSegments[0]!;
      expect(seg.mode.kind).toBe("active");
      if (seg.mode.kind === "active") {
        expect(seg.mode.memoryIndex).toBe(0);
        expect(seg.mode.offset.kind).toBe("i32.const");
      }
      expect(seg.byteLength).toBe(3);
      expect(seg.bytes).toEqual([0x61, 0x62, 0x63]);
    });

    it("parses a passive data segment (flags=1)", () => {
      const result = parseWasmModule(passiveDataModule());
      expect(result.ok).toBe(true);
      expect(result.module!.dataSegments[0]!.mode.kind).toBe("passive");
      expect(result.module!.dataSegments[0]!.bytes).toEqual([0x78, 0x79]);
    });

    it("parses active data segment with explicit memory index (flags=2)", () => {
      const result = parseWasmModule(activeDataExplicitMemoryModule());
      expect(result.ok).toBe(true);
      const seg = result.module!.dataSegments[0]!;
      expect(seg.mode.kind).toBe("active");
      if (seg.mode.kind === "active") {
        expect(seg.mode.memoryIndex).toBe(1);
      }
    });

    it("rejects data segment with out-of-range memory index", () => {
      const bad = new Uint8Array([
        ...header(),
        ...section(5, [...u32(1), 0x00, 1]), // one memory
        ...section(11, [
          ...u32(1),
          0x02, // flags=2: explicit memory index
          0x05, // memory index 5 (out of range)
          0x41, 0x00, 0x0b,
          ...u32(0),
        ]),
      ]);
      const result = parseWasmModule(bad);
      expect(result.ok).toBe(false);
      expect(result.diagnostics.some((d) => d.message.includes("out of range"))).toBe(true);
    });

    it("marks global.get offset as unresolved", () => {
      const result = parseWasmModule(globalOffsetDataModule());
      expect(result.ok).toBe(true);
      const seg = result.module!.dataSegments[0]!;
      if (seg.mode.kind === "active") {
        expect(seg.mode.offset.kind).toBe("global.get");
        if (seg.mode.offset.kind === "global.get") {
          expect(seg.mode.offset.resolved).toBe(false);
          expect(seg.mode.offset.index).toBe(0);
        }
      }
    });
  });

  describe("element segments", () => {
    it("parses an active element segment (flags=0)", () => {
      const result = parseWasmModule(activeElementModule());
      expect(result.ok).toBe(true);
      expect(result.module!.elementSegments).toHaveLength(1);
      expect(result.module!.elementSegments[0]!.mode.kind).toBe("active");
    });

    it("parses a passive element segment (flags=1)", () => {
      const result = parseWasmModule(passiveElementModule());
      expect(result.ok).toBe(true);
      expect(result.module!.elementSegments).toHaveLength(1);
      expect(result.module!.elementSegments[0]!.mode.kind).toBe("passive");
    });
  });

  describe("custom sections", () => {
    it("records custom section name and offset", () => {
      const result = parseWasmModule(customSectionModule());
      expect(result.ok).toBe(true);
      expect(result.module!.customSections).toHaveLength(1);
      expect(result.module!.customSections[0]!.name).toBe("test");
      expect(result.module!.customSections[0]!.offset).toBeGreaterThanOrEqual(8);
    });
  });

  describe("large values", () => {
    it("preserves large Memory64 values without truncation", () => {
      // min = 2^32 pages (would be 2^48 bytes)
      const largePageCount = 1n << 32n;
      const bytes = new Uint8Array([
        ...header(),
        ...section(5, [...u32(1), 0x04, ...u64(largePageCount)]),
      ]);
      const result = parseWasmModule(bytes);
      expect(result.ok).toBe(true);
      const mem = result.module!.memories[0]!;
      expect(mem.limits.initial.value).toBe(largePageCount);
      // Byte size: 2^32 * 2^16 = 2^48
      expect(mem.limits.initialBytes.value).toBe(largePageCount * 65536n);
      expect(mem.limits.initialBytes.decimal).toBe((largePageCount * 65536n).toString());
    });
  });
});