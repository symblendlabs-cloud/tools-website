import { describe, it, expect } from "vitest";
import {
  parseTracepointFormat,
  generateCode,
  validateCode,
  DEFAULT_EXAMPLE,
  type ParsedField,
} from "../ebpf";

const FIXTURE = `name: sys_enter_openat
ID: 612
format:
	field:unsigned short common_type;	offset:0;	size:2;	signed:0;
	field:unsigned char common_flags;	offset:2;	size:1;	signed:0;
	field:unsigned char common_preempt_count;	offset:3;	size:1;	signed:0;
	field:int common_pid;	offset:4;	size:4;	signed:1;

	field:int __syscall_nr;	offset:8;	size:4;	signed:1;
	field:int dfd;	offset:16;	size:8;	signed:0;
	field:const char * filename;	offset:24;	size:8;	signed:0;
	field:int flags;	offset:32;	size:8;	signed:0;
	field:umode_t mode;	offset:40;	size:8;	signed:0;
`;

describe("parseTracepointFormat", () => {
  it("extracts the tracepoint name and id from headers", () => {
    const r = parseTracepointFormat(FIXTURE);
    expect(r.name).toBe("sys_enter_openat");
    expect(r.id).toBe("612");
  });

  it("extracts all nine field declarations", () => {
    const r = parseTracepointFormat(FIXTURE);
    expect(r.fields).toHaveLength(9);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("preserves field order", () => {
    const r = parseTracepointFormat(FIXTURE);
    expect(r.fields.map((f) => f.name)).toEqual([
      "common_type",
      "common_flags",
      "common_preempt_count",
      "common_pid",
      "__syscall_nr",
      "dfd",
      "filename",
      "flags",
      "mode",
    ]);
  });

  it("extracts offsets and sizes for dfd", () => {
    const r = parseTracepointFormat(FIXTURE);
    const dfd = r.fields.find((f) => f.name === "dfd");
    expect(dfd).toBeDefined();
    expect(dfd?.offset).toBe(16);
    expect(dfd?.size).toBe(8);
    expect(dfd?.signed).toBe(false);
  });

  it("extracts signedness", () => {
    const r = parseTracepointFormat(FIXTURE);
    const syscallNr = r.fields.find((f) => f.name === "__syscall_nr");
    expect(syscallNr?.signed).toBe(true);
    const dfd = r.fields.find((f) => f.name === "dfd");
    expect(dfd?.signed).toBe(false);
  });

  it("identifies common fields", () => {
    const r = parseTracepointFormat(FIXTURE);
    const common = r.fields.filter((f) => f.isCommon);
    expect(common.map((f) => f.name)).toEqual([
      "common_type",
      "common_flags",
      "common_preempt_count",
      "common_pid",
    ]);
  });

  it("parses pointer declarations", () => {
    const r = parseTracepointFormat(FIXTURE);
    const filename = r.fields.find((f) => f.name === "filename");
    expect(filename).toBeDefined();
    expect(filename?.type).toContain("char");
  });

  it("parses fixed-size arrays", () => {
    const input = `name: test
format:
	field:char comm[16];	offset:0;	size:16;	signed:0;
`;
    const r = parseTracepointFormat(input);
    const comm = r.fields.find((f) => f.name === "comm");
    expect(comm?.arrayLength).toBe(16);
  });

  it("parses __data_loc fields", () => {
    const input = `name: test
format:
	field:__data_loc char[] filename;	offset:0;	size:4;	signed:0;
`;
    const r = parseTracepointFormat(input);
    const f = r.fields.find((x) => x.name === "filename");
    expect(f?.isDataLoc).toBe(true);
  });

  it("rejects empty input with an error", () => {
    const r = parseTracepointFormat("");
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("rejects a malformed field declaration", () => {
    const input = `name: test
format:
	field:broken
`;
    const r = parseTracepointFormat(input);
    expect(r.ok).toBe(false);
  });

  it("rejects unexpected content in the format section", () => {
    const input = `name: test
format:
	not-a-field line
`;
    const r = parseTracepointFormat(input);
    expect(r.ok).toBe(false);
  });

  it("DEFAULT_EXAMPLE parses successfully", () => {
    const r = parseTracepointFormat(DEFAULT_EXAMPLE);
    expect(r.ok).toBe(true);
    expect(r.fields.length).toBeGreaterThan(0);
  });
});

describe("generateCode", () => {
  const baseFields: ParsedField[] = parseTracepointFormat(FIXTURE).fields;

  it("produces a valid section declaration", () => {
    const result = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: baseFields,
      selectedFieldNames: ["dfd"],
      customCode: "",
    });
    expect(result.ok).toBe(true);
    expect(result.code).toContain('SEC("tracepoint/syscalls/sys_enter_openat")');
  });

  it("produces a license declaration", () => {
    const result = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: baseFields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.code).toContain('SEC("license")');
  });

  it("includes selected field access", () => {
    const result = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: baseFields,
      selectedFieldNames: ["dfd", "filename"],
      customCode: "",
    });
    expect(result.code).toContain("dfd");
    expect(result.code).toContain("filename");
  });

  it("warns about unknown selected fields", () => {
    const result = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: baseFields,
      selectedFieldNames: ["nonexistent"],
      customCode: "",
    });
    expect(result.warnings.some((w) => w.includes("nonexistent"))).toBe(true);
  });

  it("includes common fields in the struct to preserve offsets", () => {
    const result = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: baseFields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.code).toMatch(/common_type/);
    expect(result.code).toMatch(/common_pid/);
  });

  it("produces a starter template when no fields exist", () => {
    const result = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: [],
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.ok).toBe(true);
    expect(result.code).toContain("No format file provided");
  });

  it("fails when category is empty", () => {
    const result = generateCode({
      category: "",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: baseFields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.ok).toBe(false);
  });

  it("fails when event is empty", () => {
    const result = generateCode({
      category: "syscalls",
      event: "",
      programName: "",
      contextStructName: "",
      parsedFields: baseFields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.ok).toBe(false);
  });
});

describe("validateCode", () => {
  const parsedFields: ParsedField[] = parseTracepointFormat(FIXTURE).fields;
  const ctx = {
    parsedFields,
    selectedFieldNames: ["dfd"],
    structName: "trace_event_raw_sys_enter_openat",
    programName: "tracepoint__syscalls__sys_enter_openat",
  };

  function generate(): string {
    const result = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: ctx.programName,
      contextStructName: ctx.structName,
      parsedFields,
      selectedFieldNames: ctx.selectedFieldNames,
      customCode: "",
    });
    return result.code;
  }

  it("accepts the generated code", () => {
    const result = validateCode(generate(), ctx);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("detects a missing bpf_helpers.h include", () => {
    const source = generate().replace(
      "#include <bpf/bpf_helpers.h>",
      "// removed",
    );
    const result = validateCode(source, ctx);
    expect(
      result.diagnostics.some((d) => d.code === "BPF-MISSING-HELPERS"),
    ).toBe(true);
  });

  it("detects a missing tracepoint SEC declaration", () => {
    const source = generate().replace(
      'SEC("tracepoint/syscalls/sys_enter_openat")',
      'SEC("kprobe/foo")',
    );
    const result = validateCode(source, ctx);
    expect(
      result.diagnostics.some((d) => d.code === "BPF-MISSING-SECTION"),
    ).toBe(true);
  });

  it("detects a missing license declaration", () => {
    const source = generate().replace('char LICENSE[] SEC("license") = "GPL";', "");
    const result = validateCode(source, ctx);
    expect(
      result.diagnostics.some((d) => d.code === "BPF-MISSING-LICENSE"),
    ).toBe(true);
  });

  it("detects a missing probe function", () => {
    const source = generate().replace(ctx.programName, "renamed_probe");
    const result = validateCode(source, ctx);
    expect(
      result.diagnostics.some((d) => d.code === "BPF-MISSING-PROBE"),
    ).toBe(true);
  });

  it("detects an unknown ctx field reference", () => {
    const source = generate().replace("(void)ctx;", "(void)ctx->unknown_field;");
    const result = validateCode(source, ctx);
    expect(
      result.diagnostics.some((d) => d.code === "BPF-UNKNOWN-FIELD"),
    ).toBe(true);
  });

  it("reports an info message when no format was parsed", () => {
    const source = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: ctx.programName,
      contextStructName: ctx.structName,
      parsedFields: [],
      selectedFieldNames: [],
      customCode: "",
    }).code;
    const result = validateCode(source, {
      ...ctx,
      parsedFields: [],
      selectedFieldNames: [],
    });
    expect(
      result.diagnostics.some((d) => d.code === "BPF-NO-FORMAT"),
    ).toBe(true);
  });

  it("returns diagnostics with consistent shape", () => {
    const result = validateCode("not c at all", ctx);
    for (const d of result.diagnostics) {
      expect(d.severity).toMatch(/^(error|warning|info)$/);
      expect(typeof d.message).toBe("string");
      expect(typeof d.code).toBe("string");
    }
  });

  describe("generateCode — offset preservation", () => {
  it("preserves offsets with a 4-byte gap between __syscall_nr and dfd", () => {
    const fields = parseTracepointFormat(FIXTURE).fields;
    const result = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: fields,
      selectedFieldNames: ["dfd"],
      customCode: "",
    });
    expect(result.ok).toBe(true);
    // The struct must have explicit padding between offset 12 (end of __syscall_nr) and offset 16 (start of dfd).
    expect(result.code).toMatch(/char __pad_12\[4\];/);
    // The struct must include common_type at offset 0
    expect(result.code).toMatch(/common_type/);
  });

  it("emits common fields in the struct to preserve offsets", () => {
    const fields = parseTracepointFormat(FIXTURE).fields;
    const result = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: fields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.code).toMatch(/common_type/);
    expect(result.code).toMatch(/common_pid/);
  });

  it("does not change offsets when only a subset of fields is selected", () => {
    const fields = parseTracepointFormat(FIXTURE).fields;
    const all = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: fields,
      selectedFieldNames: ["dfd", "filename", "flags", "mode"],
      customCode: "",
    });
    const one = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: fields,
      selectedFieldNames: ["mode"],
      customCode: "",
    });
    // The struct body is identical in both cases. Only the probe body differs.
    const allStruct = all.code.split("};")[0];
    const oneStruct = one.code.split("};")[0];
    expect(allStruct).toBe(oneStruct);
  });

  it("generates padding for a struct with leading gaps", () => {
    const fields = parseTracepointFormat(
      `name: test
format:
	field:unsigned char reserved[3];	offset:0;	size:3;	signed:0;
	field:int value;	offset:8;	size:4;	signed:1;
`,
    ).fields;
    const result = generateCode({
      category: "test",
      event: "event",
      programName: "",
      contextStructName: "",
      parsedFields: fields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.ok).toBe(true);
    // reserved ends at 3, value starts at 8 → pad 5 bytes.
    expect(result.code).toMatch(/char __pad_3\[5\];/);
  });

  it("handles fields with different sizes and types", () => {
    const fields = parseTracepointFormat(
      `name: test
format:
	field:unsigned char a;	offset:0;	size:1;	signed:0;
	field:short b;	offset:2;	size:2;	signed:1;
	field:int c;	offset:4;	size:4;	signed:1;
	field:long d;	offset:8;	size:8;	signed:1;
`,
    ).fields;
    const result = generateCode({
      category: "test",
      event: "event",
      programName: "",
      contextStructName: "",
      parsedFields: fields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.ok).toBe(true);
    expect(result.code).toMatch(/char __pad_1\[1\];/);
    expect(result.code).toMatch(/\ba;/);
    expect(result.code).toMatch(/\bb;/);
    expect(result.code).toMatch(/\bc;/);
    expect(result.code).toMatch(/\bd;/);
  });

  it("rejects a format file with overlapping offsets", () => {
    const fields = parseTracepointFormat(
      `name: test
format:
	field:int a;	offset:0;	size:4;	signed:1;
	field:int b;	offset:2;	size:4;	signed:1;
`,
    ).fields;
    const result = generateCode({
      category: "test",
      event: "event",
      programName: "",
      contextStructName: "",
      parsedFields: fields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.ok).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/overlaps/i);
  });
});

describe("generateCode — category and event validation", () => {
  const validFields = parseTracepointFormat(FIXTURE).fields;

  it("accepts valid category and event names unchanged", () => {
    const result = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: validFields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.ok).toBe(true);
    expect(result.code).toContain('SEC("tracepoint/syscalls/sys_enter_openat")');
  });

  it("rejects an empty category", () => {
    const result = generateCode({
      category: "",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: validFields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a category with a slash", () => {
    const result = generateCode({
      category: "sys/calls",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: validFields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.ok).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/Category/);
  });

  it("rejects an event with a traversal sequence", () => {
    const result = generateCode({
      category: "syscalls",
      event: "../sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: validFields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.ok).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/Event/);
  });

  it("rejects an event with a space", () => {
    const result = generateCode({
      category: "syscalls",
      event: "sys enter",
      programName: "",
      contextStructName: "",
      parsedFields: validFields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.ok).toBe(false);
  });

  it("preserves a valid category with digits and underscores exactly", () => {
    const result = generateCode({
      category: "raw_syscalls2",
      event: "sys_enter_x86_64",
      programName: "",
      contextStructName: "",
      parsedFields: validFields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.ok).toBe(true);
    expect(result.code).toContain('SEC("tracepoint/raw_syscalls2/sys_enter_x86_64")');
  });

  it("sanitizes an invalid program name with a warning", () => {
    const result = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: "my-probe",
      contextStructName: "",
      parsedFields: validFields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes("my-probe"))).toBe(true);
    expect(result.code).toContain("int my_probe(");
  });
});
});
describe("DEFAULT_EXAMPLE — real sys_enter_openat layout", () => {
  it("parses the fixture with realistic Linux types", () => {
    const r = parseTracepointFormat(DEFAULT_EXAMPLE);
    expect(r.ok).toBe(true);

    const dfd = r.fields.find((f) => f.name === "dfd");
    expect(dfd?.type).toBe("int");
    expect(dfd?.offset).toBe(16);
    expect(dfd?.size).toBe(4);

    const filename = r.fields.find((f) => f.name === "filename");
    expect(filename?.type).toContain("*");
    expect(filename?.offset).toBe(24);
    expect(filename?.size).toBe(8);

    const flags = r.fields.find((f) => f.name === "flags");
    expect(flags?.type).toBe("unsigned long");
    expect(flags?.offset).toBe(32);
    expect(flags?.size).toBe(8);

    const mode = r.fields.find((f) => f.name === "mode");
    expect(mode?.type).toBe("umode_t");
    expect(mode?.offset).toBe(40);
    expect(mode?.size).toBe(2);
  });

  it("recognises filename as a pointer, not a scalar", () => {
    const fields = parseTracepointFormat(DEFAULT_EXAMPLE).fields;
    const filename = fields.find((f) => f.name === "filename");
    expect(filename?.type).toMatch(/\*/);
    expect(filename?.arrayLength).toBeNull();
    expect(filename?.isDataLoc).toBe(false);
  });

  it("generates C declarations that match the fixture types and sizes", () => {
    const fields = parseTracepointFormat(DEFAULT_EXAMPLE).fields;
    const result = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: fields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.ok).toBe(true);
    expect(result.code).toMatch(/\bint dfd;/);
    expect(result.code).toMatch(/const char \* filename;/);
    expect(result.code).toMatch(/unsigned long flags;/);
    expect(result.code).toMatch(/\bumode_t mode;/);
  });

  it("emits a 4-byte gap between dfd and filename", () => {
    const fields = parseTracepointFormat(DEFAULT_EXAMPLE).fields;
    const result = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: fields,
      selectedFieldNames: [],
      customCode: "",
    });
    // dfd ends at 20, filename starts at 24 → pad 4 bytes.
    expect(result.code).toMatch(/char __pad_20\[4\];/);
  });

  it("produces no type/size consistency warnings for the fixture", () => {
    const fields = parseTracepointFormat(DEFAULT_EXAMPLE).fields;
    const result = generateCode({
      category: "syscalls",
      event: "sys_enter_openat",
      programName: "",
      contextStructName: "",
      parsedFields: fields,
      selectedFieldNames: [],
      customCode: "",
    });
    const sizeWarnings = result.warnings.filter((w) => /size/i.test(w) && /mismatch|should be|must be/i.test(w));
    expect(sizeWarnings).toEqual([]);
  });
});

describe("type/size consistency diagnostics", () => {
  it("warns when int is declared with size 8", () => {
    const fields = parseTracepointFormat(
      `name: t
format:
	field:int x;	offset:0;	size:8;	signed:1;
`,
    ).fields;
    const result = generateCode({
      category: "t",
      event: "e",
      programName: "",
      contextStructName: "",
      parsedFields: fields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.warnings.some((w) => /"x"/.test(w) && /int/.test(w) && /8 bytes/.test(w))).toBe(true);
  });

  it("warns when a pointer is not 8 bytes", () => {
    const fields = parseTracepointFormat(
      `name: t
format:
	field:const char * p;	offset:0;	size:4;	signed:0;
`,
    ).fields;
    const result = generateCode({
      category: "t",
      event: "e",
      programName: "",
      contextStructName: "",
      parsedFields: fields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.warnings.some((w) => /"p"/.test(w) && /pointer/.test(w))).toBe(true);
  });

  it("warns when an array element count and size disagree", () => {
    const fields = parseTracepointFormat(
      `name: t
format:
	field:char buf[16];	offset:0;	size:8;	signed:0;
`,
    ).fields;
    const result = generateCode({
      category: "t",
      event: "e",
      programName: "",
      contextStructName: "",
      parsedFields: fields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.warnings.some((w) => /"buf"/.test(w) && /array/.test(w))).toBe(true);
  });

  it("warns when __data_loc is not 4 bytes", () => {
    const fields = parseTracepointFormat(
      `name: t
format:
	field:__data_loc char[] s;	offset:0;	size:8;	signed:0;
`,
    ).fields;
    const result = generateCode({
      category: "t",
      event: "e",
      programName: "",
      contextStructName: "",
      parsedFields: fields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.warnings.some((w) => /"s"/.test(w) && /__data_loc/.test(w))).toBe(true);
  });

  it("does not warn for a consistent primitive", () => {
    const fields = parseTracepointFormat(
      `name: t
format:
	field:int ok;	offset:0;	size:4;	signed:1;
`,
    ).fields;
    const result = generateCode({
      category: "t",
      event: "e",
      programName: "",
      contextStructName: "",
      parsedFields: fields,
      selectedFieldNames: [],
      customCode: "",
    });
    expect(result.warnings.filter((w) => /size/i.test(w))).toEqual([]);
  });
});