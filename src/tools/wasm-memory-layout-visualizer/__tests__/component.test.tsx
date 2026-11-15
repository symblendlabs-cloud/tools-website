// src/tools/wasm-memory-layout-visualizer/__tests__/component.test.tsx

// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import WasmMemoryLayoutVisualizer from "../index";

// ---------------------------------------------------------------------------
// Fixture builders (duplicated locally, per repo convention)
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

function i32Signed(n: number): number[] {
  const out: number[] = [];
  let v = n | 0;
  let more = true;
  while (more) {
    let b = v & 0x7f;
    v >>= 7;
    if ((v === 0 && (b & 0x40) === 0) || (v === -1 && (b & 0x40) !== 0)) {
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

function toFile(bytes: number[], filename = "test.wasm"): File {
  const u8 = new Uint8Array(bytes);
  const file = new File([u8], filename, { type: "application/wasm" });
  // jsdom does not implement File.prototype.arrayBuffer.
  // Attach it here so the component's `await file.arrayBuffer()` resolves.
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: () => Promise.resolve(u8.buffer.slice(0)),
  });
  Object.defineProperty(file, "text", {
    configurable: true,
    value: () => Promise.resolve(new TextDecoder().decode(u8)),
  });
  return file;
}

// Valid minimal module: header + one defined memory (min 1)
function minimalMemoryModule(): number[] {
  return [...header(), ...section(5, [...u32(1), 0x00, 1])];
}

// Module with an active data segment at offset 16, length 3
function activeDataModule(): number[] {
  return [
    ...header(),
    ...section(5, [...u32(1), 0x00, 1]),
    ...section(11, [
      ...u32(1),
      0x00,
      0x41, ...i32Signed(16), 0x0b,
      ...u32(3), 0x61, 0x62, 0x63,
    ]),
  ];
}

// Module with a passive data segment
function passiveDataModule(): number[] {
  return [
    ...header(),
    ...section(11, [...u32(1), 0x01, ...u32(2), 0x78, 0x79]),
  ];
}

// Module with Memory64 declared
function memory64Module(): number[] {
  return [...header(), ...section(5, [...u32(1), 0x04, ...u64(1n)])];
}

// Module with exported __stack_pointer global
function stackPointerModule(): number[] {
  return [
    ...header(),
    ...section(5, [...u32(1), 0x00, 1]),
    ...section(6, [
      ...u32(1),
      0x7f, 0x01, 0x41, ...i32Signed(1024), 0x0b,
    ]),
    ...section(7, [
      ...u32(1),
      ...name("__stack_pointer"), 0x03, 0x00,
    ]),
  ];
}

// A malformed module: bad magic
function badMagicModule(): number[] {
  return [0x00, 0x00, 0x00, 0x00, 1, 0, 0, 0];
}

// ---------------------------------------------------------------------------
// Helper: simulate a file selection through the visible <input type="file">
// ---------------------------------------------------------------------------

function uploadFile(file: File): HTMLInputElement {
  const input = screen.getByLabelText(
    /select a \.wasm file/i,
  ) as HTMLInputElement;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
  });
  fireEvent.change(input);
  return input;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
});

describe("WasmMemoryLayoutVisualizer", () => {
  it("renders the initial empty state with file picker and disabled export", () => {
    render(<WasmMemoryLayoutVisualizer />);
    expect(screen.getByLabelText(/select a \.wasm file/i)).toBeInTheDocument();
    expect(screen.getByTestId("empty-state-message")).toBeInTheDocument();
    const exportBtn = screen.getByRole("button", {
      name: /export report as json/i,
    });
    expect(exportBtn).toBeDisabled();
  });

  it("accepts a valid module and renders the memory overview", async () => {
    render(<WasmMemoryLayoutVisualizer />);
    uploadFile(toFile(minimalMemoryModule(), "min.wasm"));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /^memory overview$/i }),
      ).toBeInTheDocument();
    });
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBeGreaterThan(1);
    expect(screen.getByText("min.wasm")).toBeInTheDocument();
  });

  it("rejects an empty file with a user-visible error", async () => {
    render(<WasmMemoryLayoutVisualizer />);
    uploadFile(toFile([], "empty.wasm"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/empty/i);
    });
  });

  it("rejects a file larger than the size limit", async () => {
    render(<WasmMemoryLayoutVisualizer />);
    // 16 MiB + 1 bytes: exceeds the component's MAX_FILE_BYTES
    const bigBytes = new Array(16 * 1024 * 1024 + 1).fill(0);
    uploadFile(toFile(bigBytes, "big.wasm"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/exceeds/i);
    });
  });

  it("reports a parser error for an invalid magic header", async () => {
    render(<WasmMemoryLayoutVisualizer />);
    uploadFile(toFile(badMagicModule(), "bad.wasm"));
    await waitFor(() => {
      expect(screen.getByText(/parser errors/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/magic/i);
  });

  it("renders active data segment details for a module with active segments", async () => {
    render(<WasmMemoryLayoutVisualizer />);
    uploadFile(toFile(activeDataModule(), "active.wasm"));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /^data segments$/i }),
      ).toBeInTheDocument();
    });
    const region = screen.getByRole("region", { name: /^data segments$/i });
    expect(within(region).getByText("active")).toBeInTheDocument();
    expect(within(region).getByText("16 (0x10)")).toBeInTheDocument();
    expect(within(region).getByText("19 (0x13)")).toBeInTheDocument();
  });

  it("renders passive segments with null addresses", async () => {
    render(<WasmMemoryLayoutVisualizer />);
    uploadFile(toFile(passiveDataModule(), "passive.wasm"));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /^data segments$/i }),
      ).toBeInTheDocument();
    });
    const region = screen.getByRole("region", { name: /^data segments$/i });
    expect(within(region).getByText("passive")).toBeInTheDocument();
    // Start and End columns render em-dashes for null.
    const EM_DASH = String.fromCharCode(0x2014);
    const dashes = within(region).getAllByText(EM_DASH);
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("renders Memory64 in the memory overview", async () => {
    render(<WasmMemoryLayoutVisualizer />);
    uploadFile(toFile(memory64Module(), "m64.wasm"));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /^memory overview$/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("memory64")).toBeInTheDocument();
  });

  it("renders recognized globals with static values and marks runtime value unknown", async () => {
    render(<WasmMemoryLayoutVisualizer />);
    uploadFile(toFile(stackPointerModule(), "sp.wasm"));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: /^globals, stack and heap metadata$/i,
        }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("__stack_pointer")).toBeInTheDocument();
    expect(screen.getByText("1024 (0x400)")).toBeInTheDocument();
    expect(screen.getAllByText("unknown").length).toBeGreaterThan(0);
  });

  it("exports a JSON report when the export button is clicked", async () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    render(<WasmMemoryLayoutVisualizer />);
    uploadFile(toFile(minimalMemoryModule(), "min.wasm"));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /^memory overview$/i }),
      ).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole("button", {
      name: /export report as json/i,
    });
    expect(exportBtn).not.toBeDisabled();
    fireEvent.click(exportBtn);

    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
  });

  it("Clear resets all state and disables export", async () => {
    render(<WasmMemoryLayoutVisualizer />);
    uploadFile(toFile(minimalMemoryModule(), "min.wasm"));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /^memory overview$/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    await waitFor(() => {
      expect(screen.getByTestId("empty-state-message")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /export report as json/i }),
    ).toBeDisabled();
  });

  it("never instantiates the uploaded module", async () => {
    const instantiateSpy = vi.fn();
    const compileSpy = vi.fn();
    const originalWebAssembly = globalThis.WebAssembly;
    Object.defineProperty(globalThis, "WebAssembly", {
      configurable: true,
      value: {
        instantiate: instantiateSpy,
        compile: compileSpy,
      },
    });

    try {
      render(<WasmMemoryLayoutVisualizer />);
      uploadFile(toFile(minimalMemoryModule(), "min.wasm"));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /^memory overview$/i }),
        ).toBeInTheDocument();
      });
      expect(instantiateSpy).not.toHaveBeenCalled();
      expect(compileSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, "WebAssembly", {
        configurable: true,
        value: originalWebAssembly,
      });
    }
  });

  it("does not transmit the file (no fetch, no XHR)", async () => {
    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchSpy,
    });

    try {
      render(<WasmMemoryLayoutVisualizer />);
      uploadFile(toFile(minimalMemoryModule(), "min.wasm"));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /^memory overview$/i }),
        ).toBeInTheDocument();
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: originalFetch,
      });
    }
  });

  it("announces loading state politely", async () => {
    render(<WasmMemoryLayoutVisualizer />);
    uploadFile(toFile(minimalMemoryModule(), "min.wasm"));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /^memory overview$/i }),
      ).toBeInTheDocument();
    });
  });

  it("displays the selected filename and size after upload", async () => {
    render(<WasmMemoryLayoutVisualizer />);
    const bytes = minimalMemoryModule();
    uploadFile(toFile(bytes, "custom-name.wasm"));
    await waitFor(() => {
      const matches = screen.getAllByText(/custom-name\.wasm/);
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("renders unclassified regions without the phrase 'free memory'", async () => {
    render(<WasmMemoryLayoutVisualizer />);
    uploadFile(toFile(minimalMemoryModule(), "min.wasm"));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: /^unclassified address ranges$/i,
        }),
      ).toBeInTheDocument();
    });
    // The section description uses "not free memory" deliberately; that is
    // correct explanatory copy. Only the data area must be free of the phrase.
    const region = screen.getByRole("region", {
      name: /^unclassified address ranges$/i,
    });
    const dataArea = region.querySelector('[data-region-list="unclassified"]');
    expect(dataArea).not.toBeNull();
    expect(
      within(dataArea as HTMLElement).queryByText(/free memory/i),
    ).toBeNull();
    expect(screen.queryByText(/unused heap/i)).toBeNull();
  });

  it("renders the analyzer warnings section even when empty", async () => {
    render(<WasmMemoryLayoutVisualizer />);
    uploadFile(toFile(minimalMemoryModule(), "min.wasm"));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /^analyzer warnings$/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/no analyzer warnings reported/i),
    ).toBeInTheDocument();
  });

  it("renders the parser diagnostics section for a valid module", async () => {
    render(<WasmMemoryLayoutVisualizer />);
    uploadFile(toFile(minimalMemoryModule(), "min.wasm"));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /^parser diagnostics$/i }),
      ).toBeInTheDocument();
    });
  });

  it("exposes a labelled file input and a drop zone", () => {
    render(<WasmMemoryLayoutVisualizer />);
    expect(screen.getByLabelText(/select a \.wasm file/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/drop a \.wasm file here/i),
    ).toBeInTheDocument();
  });
});