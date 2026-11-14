/**
 * eBPF Tracepoint Syntax Helper — core parsing, generation, and validation.
 *
 * All functions are pure. No DOM, no fetch, no eval, no Function.
 *
 * The `@lezer/c-parser` dependency is used for C syntax validation only.
 * It is not a compiler and does not verify eBPF semantics.
 */

import { parser as cParser } from "@lezer/cpp";

// ─── Tracepoint format parser ───────────────────────────────────

export interface ParsedField {
  /** Original declaration line, e.g. "unsigned short common_type" */
  declaration: string;
  /** Normalized type, e.g. "unsigned short" */
  type: string;
  /** Field name, e.g. "common_type" */
  name: string;
  /** Byte offset from the format file */
  offset: number;
  /** Byte size from the format file */
  size: number;
  /** Signedness from the format file */
  signed: boolean;
  /** Fixed array length, if applicable */
  arrayLength: number | null;
  /** Whether this is a __data_loc field */
  isDataLoc: boolean;
  /** Whether this is a __rel_loc field */
  isRelLoc: boolean;
  /** Whether this is a common_* tracepoint header field */
  isCommon: boolean;
}

export interface ParseResult {
  ok: boolean;
  name: string;
  id: string;
  fields: ParsedField[];
  errors: string[];
}

const COMMON_FIELD_NAMES = new Set([
  "common_type",
  "common_flags",
  "common_preempt_count",
  "common_pid",
]);

const FIELD_LINE_RE =
  /^field:([^;]+);\s*offset:(\d+);\s*size:(\d+);\s*signed:(\d+);\s*$/;

/**
 * Parse a Linux tracepoint `format` file.
 *
 * Accepts the standard format found at:
 *   /sys/kernel/debug/tracing/events/<category>/<event>/format
 */
export function parseTracepointFormat(raw: string): ParseResult {
  const result: ParseResult = {
    ok: true,
    name: "",
    id: "",
    fields: [],
    errors: [],
  };

  const lines = raw.split(/\r?\n/);
  let inFormat = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    if (trimmed.startsWith("name:")) {
      result.name = trimmed.slice("name:".length).trim();
      continue;
    }
    if (trimmed.startsWith("ID:")) {
      result.id = trimmed.slice("ID:".length).trim();
      continue;
    }
    if (trimmed === "format:") {
      inFormat = true;
      continue;
    }
    if (!inFormat) continue;

    if (!trimmed.startsWith("field:")) {
      result.errors.push(
        `Line ${i + 1}: unexpected content in format section: "${trimmed}"`,
      );
      result.ok = false;
      continue;
    }

    const match = FIELD_LINE_RE.exec(trimmed);
    if (!match) {
      result.errors.push(
        `Line ${i + 1}: malformed field declaration: "${trimmed}"`,
      );
      result.ok = false;
      continue;
    }

    const decl = (match[1] ?? "").trim();
    const offset = Number(match[2]);
    const size = Number(match[3]);
    const signed = match[4] === "1";

    const isDataLoc = decl.startsWith("__data_loc ");
    const isRelLoc = decl.startsWith("__rel_loc ");
    let working = decl;
    if (isDataLoc) working = working.slice("__data_loc ".length).trim();
    if (isRelLoc) working = working.slice("__rel_loc ".length).trim();

    // Parse fixed-size array: "char buf[16]" or "char comm[16]"
    let arrayLength: number | null = null;
    let name = "";
    let type = "";

    const arrayMatch = /^(.+?)\s+([A-Za-z_][A-Za-z0-9_]*)\[(\d+)\]$/.exec(
      working,
    );
    if (arrayMatch) {
      type = (arrayMatch[1] ?? "").trim();
      name = (arrayMatch[2] ?? "").trim();
      arrayLength = Number(arrayMatch[3]);
    } else {
      // Parse "type name", "type *name", "type * name", or "type name[]".
      const simpleMatch = /^(.+?)\s+(\**\s*[A-Za-z_][A-Za-z0-9_]*)$/.exec(
        working,
      );
      if (!simpleMatch) {
        result.errors.push(
          `Line ${i + 1}: cannot parse field declaration: "${trimmed}"`,
        );
        result.ok = false;
        continue;
      }
      let declType = (simpleMatch[1] ?? "").trim();
      const rawName = (simpleMatch[2] ?? "").replace(/\s+/g, "");
      if (rawName.startsWith("*")) {
        // Preserve the pointer marker on the type.
        declType += " *";
      }
      type = declType;
      name = rawName.replace(/^\*+/, "");
    }

    result.fields.push({
      declaration: decl,
      type,
      name,
      offset,
      size,
      signed,
      arrayLength,
      isDataLoc,
      isRelLoc,
      isCommon: COMMON_FIELD_NAMES.has(name),
    });
  }

  if (result.fields.length === 0 && result.errors.length === 0) {
    result.errors.push("No field declarations found.");
    result.ok = false;
  }

  return result;
}

// ─── Validation helpers ────────────────────────────────────────

/** A tracepoint path component: no '/', no '..', no whitespace, no special chars. */
const PATH_COMPONENT_RE = /^[A-Za-z0-9_.-]+$/;

/** Validate a category / event name as a tracepoint path component. */
export function validatePathComponent(value: string): string | null {
  if (value.length === 0) return "must not be empty";
  if (value.includes("/")) return "must not contain '/'";
  if (value.includes("..")) return "must not contain '..' traversal";
  if (/\s/.test(value)) return "must not contain whitespace";
  if (!PATH_COMPONENT_RE.test(value)) {
    return "contains invalid characters (allowed: A-Z a-z 0-9 _ . -)";
  }
  return null;
}

/** Sanitize a C identifier. Returns [sanitized, changed]. */
function sanitizeIdentifier(value: string): [string, boolean] {
  const cleaned = value.replace(/[^A-Za-z0-9_]/g, "_");
  return [cleaned, cleaned !== value];
}

// ─── Code generation ───────────────────────────────────────────

export interface GenerateOptions {
  category: string;
  event: string;
  programName: string;
  contextStructName: string;
  parsedFields: ParsedField[];
  selectedFieldNames: string[];
  customCode: string;
}

export interface GenerateResult {
  ok: boolean;
  code: string;
  warnings: string[];
}

/** Render the C declaration for a single field, preserving its ABI shape. */
function renderFieldDeclaration(field: ParsedField): string {
  const suffix = `/* offset ${field.offset}, size ${field.size} */`;

  if (field.isDataLoc) {
    // __data_loc is a 32-bit offset relative to the start of the trace entry,
    // not a pointer or the logical field type. Represent it faithfully.
    return `    __u32 __data_loc ${field.name}; ${suffix}`;
  }
  if (field.isRelLoc) {
    return `    __u32 __rel_loc ${field.name}; ${suffix}`;
  }
  if (field.arrayLength !== null) {
    return `    ${field.type} ${field.name}[${field.arrayLength}]; ${suffix}`;
  }
  if (/\*/.test(field.type)) {
    // Kernel pointer; dereference requires bpf_probe_read_* helpers.
    return `    ${field.type} ${field.name}; ${suffix} /* kernel pointer — use bpf_probe_read_* to dereference */`;
  }
  return `    ${field.type} ${field.name}; ${suffix}`;
}

/**
 * Return a warning message if the declared C type is incompatible with the
 * supplied byte size in the format file, or null if the pair is consistent
 * or the type is unknown.
 *
 * Sizes are for LP64 (x86_64 / aarch64), matching Linux tracepoint ABIs.
 */
function checkTypeSizeConsistency(field: ParsedField): string | null {
  const { type, name, size, arrayLength, isDataLoc, isRelLoc } = field;
  const normalized = type.replace(/\s+/g, " ").trim();

  if (isDataLoc || isRelLoc) {
    if (size !== 4) {
      return `Field "${name}": ${isDataLoc ? "__data_loc" : "__rel_loc"} must be 4 bytes, but size ${size} was supplied.`;
    }
    return null;
  }

  if (arrayLength !== null) {
    const elemSize = primitiveSize(normalized);
    if (elemSize !== null && size !== elemSize * arrayLength) {
      return `Field "${name}": array of ${arrayLength} × ${elemSize}-byte ${normalized} should be size ${elemSize * arrayLength}, but size ${size} was supplied.`;
    }
    return null;
  }

  if (/\*/.test(normalized)) {
    if (size !== 8) {
      return `Field "${name}": pointer must be 8 bytes on LP64, but ${size} bytes were supplied.`;
    }
    return null;
  }

  const expected = primitiveSize(normalized);
  if (expected !== null && size !== expected) {
    return `Field "${name}": size mismatch — declared type "${normalized}" is ${expected} bytes, but ${size} bytes were supplied.`;
  }
  return null;
}

function primitiveSize(type: string): number | null {
  const t = type.trim();
  const unsigned = t.startsWith("unsigned ") ? "unsigned " : "";
  const base = t.replace(/^unsigned /, "").trim();
  const u = unsigned.length > 0;
  switch (base) {
    case "char": return 1;
    case "short": return 2;
    case "int": return 4;
    case "long":
    case "long long": return 8;
    case "u8":
    case "s8":
    case "__u8":
    case "__s8": return 1;
    case "u16":
    case "s16":
    case "__u16":
    case "__s16": return 2;
    case "u32":
    case "s32":
    case "__u32":
    case "__s32": return 4;
    case "u64":
    case "s64":
    case "__u64":
    case "__s64": return 8;
    case "umode_t": return 2;
    case "pid_t":
    case "uid_t":
    case "gid_t": return 4;
    case "size_t":
    case "ssize_t":
    case "off_t":
    case "loff_t": return 8;
    default:
      // Unknown typedef — do not guess.
      return u ? null : null;
  }
}

export function generateCode(options: GenerateOptions): GenerateResult {
  const warnings: string[] = [];

  // ── Validate category / event as tracepoint path components (no rewriting).
  const rawCategory = options.category.trim();
  const rawEvent = options.event.trim();

  const categoryError = validatePathComponent(rawCategory);
  if (categoryError) {
    return {
      ok: false,
      code: "",
      warnings: [
        `Category "${rawCategory}" is not a valid tracepoint path component: ${categoryError}.`,
      ],
    };
  }
  const eventError = validatePathComponent(rawEvent);
  if (eventError) {
    return {
      ok: false,
      code: "",
      warnings: [
        `Event "${rawEvent}" is not a valid tracepoint path component: ${eventError}.`,
      ],
    };
  }

  const category = rawCategory;
  const event = rawEvent;

  // ── Program name and struct name are C identifiers; sanitize separately.
  const [structName, structChanged] = sanitizeIdentifier(
    options.contextStructName.trim() || `trace_event_raw_${event}`,
  );
  if (structChanged && options.contextStructName.trim().length > 0) {
    warnings.push(
      `Context struct name "${options.contextStructName.trim()}" was sanitized to "${structName}" (must be a valid C identifier).`,
    );
  }

  const defaultProgramName = `tracepoint__${category}__${event}`;
  const [programName, programChanged] = sanitizeIdentifier(
    options.programName.trim() || defaultProgramName,
  );
  if (programChanged && options.programName.trim().length > 0) {
    warnings.push(
      `Program name "${options.programName.trim()}" was sanitized to "${programName}" (must be a valid C identifier).`,
    );
  }

  const byName = new Map(options.parsedFields.map((f) => [f.name, f]));

  // Report any field whose declared type conflicts with its supplied size.
  for (const field of options.parsedFields) {
    const issue = checkTypeSizeConsistency(field);
    if (issue) warnings.push(issue);
  }

  // ── Build the struct body preserving original offsets.
  // Sort by offset so overlapping / out-of-order inputs are handled deterministically.
  const orderedFields = [...options.parsedFields].sort(
    (a, b) => a.offset - b.offset,
  );

  const structLines: string[] = [];
  let prevEnd = 0;
  let overlap = false;

  for (const field of orderedFields) {
    if (field.offset < prevEnd) {
      warnings.push(
        `Field "${field.name}" at offset ${field.offset} overlaps the previous field (ends at ${prevEnd}). Cannot generate a safe layout.`,
      );
      overlap = true;
      continue;
    }
    if (field.offset > prevEnd) {
      const gap = field.offset - prevEnd;
      structLines.push(`    char __pad_${prevEnd}[${gap}]; /* padding */`);
    }
    structLines.push(renderFieldDeclaration(field));
    prevEnd = field.offset + field.size;
  }

  if (overlap) {
    return { ok: false, code: "", warnings };
  }

  // ── Field-access comments in the probe body (driven by selection only).
  const selectedBodies: string[] = [];
  for (const fieldName of options.selectedFieldNames) {
    const field = byName.get(fieldName);
    if (!field) {
      warnings.push(
        `Selected field "${fieldName}" is not present in the parsed format. It was skipped.`,
      );
      continue;
    }
    if (field.isCommon) {
      selectedBodies.push(
        `    /* ${field.name} = ${field.type} @ offset ${field.offset} (common header) */`,
      );
    } else if (field.isDataLoc) {
      selectedBodies.push(
        `    /* ${field.name}: __data_loc — read via bpf_probe_read_user/kernel using the 32-bit offset, do not treat as a pointer. */`,
      );
    } else if (field.isRelLoc) {
      selectedBodies.push(
        `    /* ${field.name}: __rel_loc — relative offset, read via bpf_probe_read_* helpers. */`,
      );
    } else if (field.arrayLength !== null) {
      selectedBodies.push(
        `    /* ${field.name}: fixed-size array — iterate up to ${field.arrayLength} elements. */`,
      );
    } else if (/\*/.test(field.type)) {
      selectedBodies.push(
        `    /* ${field.name}: kernel pointer — use bpf_probe_read_user/kernel to copy the pointed-to data. */`,
      );
    } else {
      selectedBodies.push(
        `    /* ${field.name} = ${field.type} @ offset ${field.offset} */`,
      );
    }
  }

  const noFormat = options.parsedFields.length === 0;

  const header = [
    "// SPDX-License-Identifier: GPL-2.0",
    "// Generated by Chifral eBPF Tracepoint Syntax Helper.",
    "// Compile and verify with a real Linux kernel before use.",
    "//",
    `// Tracepoint: ${category}/${event}`,
    "// Field layout is taken from the pasted format file when provided.",
    "// Verify against the target kernel version.",
    "",
    "#include <linux/types.h>",
    "#include <bpf/bpf_helpers.h>",
    "#include <bpf/bpf_tracing.h>",
    "",
  ].join("\n");

  const structBlock = noFormat
    ? [
        `struct ${structName} {`,
        "    /* No format file provided. Paste a Linux tracepoint format file to generate field layout. */",
        "};",
      ].join("\n")
    : [
        `struct ${structName} {`,
        ...structLines,
        "};",
      ].join("\n");

  const probeBody = [
    `SEC("tracepoint/${category}/${event}")`,
    `int ${programName}(struct ${structName} *ctx)`,
    "{",
    "    (void)ctx;",
    selectedBodies.length > 0
      ? selectedBodies.join("\n")
      : "    /* Select fields above to generate field access examples. */",
    options.customCode.trim().length > 0 ? options.customCode : null,
    "    return 0;",
    "}",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const license = 'char LICENSE[] SEC("license") = "GPL";';

  const code = [header, structBlock, "", probeBody, "", license, ""].join("\n");

  return { ok: true, code, warnings };
}

// ─── Static validator ──────────────────────────────────────────

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  line?: number;
  column?: number;
  code: string;
}

export interface ValidationResult {
  diagnostics: Diagnostic[];
  ok: boolean;
}

/**
 * Static validator for generated eBPF C source.
 *
 * Uses @lezer/c-parser for syntax errors and then runs eBPF-specific
 * structural checks. It is not a compiler and does not verify kernel
 * compatibility.
 */
export function validateCode(
  source: string,
  context: {
    parsedFields: ParsedField[];
    selectedFieldNames: string[];
    structName: string;
    programName: string;
  },
): ValidationResult {
  const diagnostics: Diagnostic[] = [];

  // C syntax via @lezer/c-parser
  try {
    const tree = cParser.parse(source);
    tree.cursor().iterate((node) => {
      if (node.type.isError) {
        diagnostics.push({
          severity: "error",
          message: `C syntax error near offset ${node.from}`,
          line: node.from,
          code: "C-SYNTAX",
        });
      }
    });
  } catch (err) {
    diagnostics.push({
      severity: "error",
      message: `C parse failed: ${(err as Error).message}`,
      code: "C-PARSE-FAILED",
    });
  }

  if (!/#include\s*<bpf\/bpf_helpers\.h>/.test(source)) {
    diagnostics.push({
      severity: "error",
      message: "Missing #include <bpf/bpf_helpers.h>.",
      code: "BPF-MISSING-HELPERS",
    });
  }

  if (!/SEC\(\s*"tracepoint\/[^"]+\/[^"]+"\s*\)/.test(source)) {
    diagnostics.push({
      severity: "error",
      message: 'Missing SEC("tracepoint/category/event") section declaration.',
      code: "BPF-MISSING-SECTION",
    });
  }

  if (!new RegExp(`\\b${context.programName}\\s*\\(`).test(source)) {
    diagnostics.push({
      severity: "error",
      message: `Missing probe function "${context.programName}".`,
      code: "BPF-MISSING-PROBE",
    });
  }

  if (!new RegExp(`\\bstruct\\s+${context.structName}\\b`).test(source)) {
    diagnostics.push({
      severity: "error",
      message: `Missing context structure "struct ${context.structName}".`,
      code: "BPF-MISSING-STRUCT",
    });
  }

  if (!/SEC\(\s*"license"\s*\)/.test(source)) {
    diagnostics.push({
      severity: "error",
      message: 'Missing SEC("license") declaration.',
      code: "BPF-MISSING-LICENSE",
    });
  }

  const parsedNames = new Set(context.parsedFields.map((f) => f.name));
  const ctxRefs = Array.from(source.matchAll(/ctx->([A-Za-z_][A-Za-z0-9_]*)/g));
  for (const match of ctxRefs) {
    const name = match[1];
    if (!name) continue;
    if (!parsedNames.has(name)) {
      diagnostics.push({
        severity: "warning",
        message: `Field reference "ctx->${name}" does not match any parsed field.`,
        code: "BPF-UNKNOWN-FIELD",
      });
    }
  }

  if (context.parsedFields.length === 0) {
    diagnostics.push({
      severity: "info",
      message:
        "No tracepoint format was parsed. Field access has not been generated. Paste a format file to generate field layout.",
      code: "BPF-NO-FORMAT",
    });
  }

  const hasError = diagnostics.some((d) => d.severity === "error");
  return { diagnostics, ok: !hasError };
}

/** Reset-friendly default example for the tool's initial state. */
export const DEFAULT_EXAMPLE = `name: sys_enter_openat
ID: 612
format:
	field:unsigned short common_type;	offset:0;	size:2;	signed:0;
	field:unsigned char common_flags;	offset:2;	size:1;	signed:0;
	field:unsigned char common_preempt_count;	offset:3;	size:1;	signed:0;
	field:int common_pid;	offset:4;	size:4;	signed:1;

	field:int __syscall_nr;	offset:8;	size:4;	signed:1;
	field:int dfd;	offset:16;	size:4;	signed:1;
	field:const char * filename;	offset:24;	size:8;	signed:0;
	field:unsigned long flags;	offset:32;	size:8;	signed:0;
	field:umode_t mode;	offset:40;	size:2;	signed:0;
`;