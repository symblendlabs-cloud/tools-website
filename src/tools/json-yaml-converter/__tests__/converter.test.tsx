// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  convertJsonToYaml,
  convertYamlToJson,
  convert,
} from "../conversion";
import JsonYamlConverter from "../index";

// Explicit RTL cleanup between tests. `globals: false` (Vitest default) means
// @testing-library/react cannot auto-register its own afterEach cleanup, so
// each render() would stack another component tree in the DOM. This manual
// registration prevents that without enabling globals globally.
afterEach(() => {
  cleanup();
});

// ─── Conversion helper tests ─────────────────────────────────────

describe("convertJsonToYaml", () => {
  it("converts valid JSON to YAML with readable indentation", () => {
    const result = convertJsonToYaml('{"name":"example","version":1}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toContain("name: example");
      expect(result.output).toContain("version: 1");
    }
  });

  it("returns empty output for empty input without error", () => {
    expect(convertJsonToYaml("")).toEqual({ ok: true, output: "" });
    expect(convertJsonToYaml("   \n\t  ")).toEqual({ ok: true, output: "" });
  });

  it("returns actionable error for invalid JSON", () => {
    const result = convertJsonToYaml("{ not valid");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});

describe("convertYamlToJson", () => {
  it("converts valid YAML to JSON with two-space indent", () => {
    const result = convertYamlToJson("name: example\nversion: 1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = JSON.parse(result.output);
      expect(parsed).toEqual({ name: "example", version: 1 });
      expect(result.output).toContain("  ");
    }
  });

  it("returns empty output for empty input without error", () => {
    expect(convertYamlToJson("")).toEqual({ ok: true, output: "" });
    expect(convertYamlToJson("  \n  ")).toEqual({ ok: true, output: "" });
  });

  it("returns actionable error for invalid YAML", () => {
    const result = convertYamlToJson("key: [unclosed");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("handles multiple YAML documents in order", () => {
    const input = "name: one\n---\nname: two\n---\nname: three";
    const result = convertYamlToJson(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = JSON.parse(result.output);
      expect(parsed).toEqual([
        { name: "one" },
        { name: "two" },
        { name: "three" },
      ]);
    }
  });

  it("represents empty YAML documents as null", () => {
    const input = "value: a\n---\n---\nvalue: b";
    const result = convertYamlToJson(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = JSON.parse(result.output);
      expect(parsed[1]).toBeNull();
    }
  });

  it("resolves YAML anchors and aliases", () => {
    const input = "defaults: &defaults\n  a: 1\ncustom:\n  a: *defaults";
    const result = convertYamlToJson(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = JSON.parse(result.output);
      expect(parsed.custom).toEqual({ a: { a: 1 } });
    }
  });
});

describe("convert round-trip", () => {
  it("preserves semantics through JSON → YAML → JSON", () => {
    const original = { name: "example", version: 1, enabled: true };
    const yamlResult = convertJsonToYaml(JSON.stringify(original));
    expect(yamlResult.ok).toBe(true);
    if (!yamlResult.ok) return;
    const backResult = convertYamlToJson(yamlResult.output);
    expect(backResult.ok).toBe(true);
    if (!backResult.ok) return;
    const parsed = JSON.parse(backResult.output);
    expect(parsed).toEqual(original);
  });
});

describe("convert (direction dispatcher)", () => {
  it("delegates json-to-yaml", () => {
    const result = convert("json-to-yaml", '{"a":1}');
    expect(result.ok).toBe(true);
  });
  it("delegates yaml-to-json", () => {
    const result = convert("yaml-to-json", "a: 1");
    expect(result.ok).toBe(true);
  });
});

// ─── Component tests ─────────────────────────────────────────────

describe("JsonYamlConverter component", () => {
  it("renders required controls", () => {
    render(<JsonYamlConverter />);
    expect(screen.getByRole("radiogroup", { name: /conversion direction/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/json input/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/yaml output/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^convert$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^copy$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^download$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^clear$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /swap/i })).toBeInTheDocument();
  });

  it("changes labels when direction changes", () => {
    render(<JsonYamlConverter />);
    fireEvent.click(screen.getByRole("radio", { name: /yaml → json/i }));
    expect(screen.getByLabelText(/yaml input/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/json output/i)).toBeInTheDocument();
  });

  it("converts JSON to YAML on Convert", async () => {
    render(<JsonYamlConverter />);
    fireEvent.change(screen.getByLabelText(/json input/i), {
      target: { value: '{"name":"example","version":1}' },
    });
    fireEvent.click(screen.getByRole("button", { name: /^convert$/i }));
    const output = screen.getByLabelText(/yaml output/i) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(output.value).toContain("name: example");
    });
  });

  it("displays accessible error on invalid input", async () => {
    render(<JsonYamlConverter />);
    fireEvent.change(screen.getByLabelText(/json input/i), {
      target: { value: "{ not valid" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^convert$/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent?.length).toBeGreaterThan(0);
  });

  it("clears state on Clear", () => {
    render(<JsonYamlConverter />);
    const input = screen.getByLabelText(/json input/i) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '{"a":1}' } });
    fireEvent.click(screen.getByRole("button", { name: /^convert$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(input.value).toBe("");
    const output = screen.getByLabelText(/yaml output/i) as HTMLTextAreaElement;
    expect(output.value).toBe("");
  });

  it("swaps output into input and reverses direction", async () => {
    render(<JsonYamlConverter />);
    fireEvent.change(screen.getByLabelText(/json input/i), {
      target: { value: '{"a":1}' },
    });
    fireEvent.click(screen.getByRole("button", { name: /^convert$/i }));
    const output = screen.getByLabelText(/yaml output/i) as HTMLTextAreaElement;
    await waitFor(() => expect(output.value).toContain("a: 1"));
    fireEvent.click(screen.getByRole("button", { name: /swap/i }));
    const newInput = screen.getByLabelText(/yaml input/i) as HTMLTextAreaElement;
    expect(newInput.value).toContain("a: 1");
  });

  it("copies output to clipboard on Copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<JsonYamlConverter />);
    fireEvent.change(screen.getByLabelText(/json input/i), {
      target: { value: '{"a":1}' },
    });
    fireEvent.click(screen.getByRole("button", { name: /^convert$/i }));
    const output = screen.getByLabelText(/yaml output/i) as HTMLTextAreaElement;
    await waitFor(() => expect(output.value).toContain("a: 1"));
    fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(await screen.findByText(/copied to clipboard/i)).toBeInTheDocument();
  });

  it("falls back gracefully when clipboard fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<JsonYamlConverter />);
    fireEvent.change(screen.getByLabelText(/json input/i), {
      target: { value: '{"a":1}' },
    });
    fireEvent.click(screen.getByRole("button", { name: /^convert$/i }));
    const output = screen.getByLabelText(/yaml output/i) as HTMLTextAreaElement;
    await waitFor(() => expect(output.value).toContain("a: 1"));
    fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(await screen.findByText(/clipboard access was unavailable/i)).toBeInTheDocument();
  });

  it("downloads output as a Blob URL", async () => {
        // jsdom does not implement HTMLAnchorElement.click() navigation to a
    // real URL. The Blob URL creation and revocation are still exercised;
    // the "Not implemented: navigation to another Document" warning in the
    // test output is expected and non-blocking.
    const createObjectURL = vi.fn().mockReturnValue("blob:test");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    render(<JsonYamlConverter />);
    fireEvent.change(screen.getByLabelText(/json input/i), {
      target: { value: '{"a":1}' },
    });
    fireEvent.click(screen.getByRole("button", { name: /^convert$/i }));
    const output = screen.getByLabelText(/yaml output/i) as HTMLTextAreaElement;
    await waitFor(() => expect(output.value).toContain("a: 1"));
    fireEvent.click(screen.getByRole("button", { name: /^download$/i }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
  });
});