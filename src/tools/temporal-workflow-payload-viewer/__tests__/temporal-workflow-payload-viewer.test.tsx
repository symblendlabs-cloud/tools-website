// @vitest-environment jsdom
// src/tools/temporal-workflow-payload-viewer/__tests__/temporal-workflow-payload-viewer.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import TemporalWorkflowPayloadViewer from "../index";
import { FILE_LIMIT_BYTES } from "../payload";

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

const JSON_PLAIN = b64("json/plain");

function validDoc(): string {
  return JSON.stringify({
    payloads: [
      { metadata: { encoding: JSON_PLAIN }, data: b64('{"orderId":"123"}') },
    ],
  });
}

function makeFile(name: string, contents: string): File {
  const file = new File([contents], name, { type: "application/json" });
  // jsdom does not implement Blob.prototype.arrayBuffer, so attach it to the
  // File instance for these tests. Production code uses the standard API; the
  // polyfill is only needed in the jsdom test environment.
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(new TextEncoder().encode(contents).buffer),
    configurable: true,
  });
  Object.defineProperty(file, "text", {
    value: () => Promise.resolve(contents),
    configurable: true,
  });
  return file;
}

describe("TemporalWorkflowPayloadViewer", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let xhrSpy: ReturnType<typeof vi.fn>;
  let beaconSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    xhrSpy = vi.fn();
    beaconSpy = vi.fn();
    // @ts-expect-error — intentional override for the no-network test.
    globalThis.fetch = fetchSpy;
    // @ts-expect-error — intentional override.
    globalThis.XMLHttpRequest = function () { return { open: xhrSpy, send: xhrSpy }; };
    // @ts-expect-error — intentional override.
    navigator.sendBeacon = beaconSpy;
  });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

  it("renders empty state initially", () => {
    render(<TemporalWorkflowPayloadViewer />);
    expect(
      screen.getByText(/paste or upload a temporal payload json/i),
    ).toBeInTheDocument();
  });

  it("shows results for a valid payload", () => {
    render(<TemporalWorkflowPayloadViewer />);
    fireEvent.change(screen.getByLabelText(/payload json/i), {
      target: { value: validDoc() },
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
    expect(screen.getByText("json/plain")).toBeInTheDocument();
    expect(screen.getByText(/"orderId":"123"/)).toBeInTheDocument();
  });

  it("shows a role=alert on invalid JSON", () => {
    render(<TemporalWorkflowPayloadViewer />);
    fireEvent.change(screen.getByLabelText(/payload json/i), {
      target: { value: "not json" },
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/invalid json/i);
  });

  it("copies the report to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<TemporalWorkflowPayloadViewer />);
    fireEvent.change(screen.getByLabelText(/payload json/i), {
      target: { value: validDoc() },
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
    fireEvent.click(screen.getByRole("button", { name: /copy report/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  });

  it("selects the report text when clipboard is unavailable", async () => {
    Object.assign(navigator, { clipboard: undefined });
    render(<TemporalWorkflowPayloadViewer />);
    fireEvent.change(screen.getByLabelText(/payload json/i), {
      target: { value: validDoc() },
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
    fireEvent.click(screen.getByRole("button", { name: /copy report/i }));
    expect(
      await screen.findByText(/clipboard access was unavailable/i),
    ).toBeInTheDocument();
  });

  it("downloads the report via a Blob object URL", () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(<TemporalWorkflowPayloadViewer />);
    fireEvent.change(screen.getByLabelText(/payload json/i), {
      target: { value: validDoc() },
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
    fireEvent.click(screen.getByRole("button", { name: /download report/i }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("clears input and results", () => {
    render(<TemporalWorkflowPayloadViewer />);
    const textarea = screen.getByLabelText(/payload json/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: validDoc() } });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(textarea.value).toBe("");
    expect(
      screen.getByText(/paste or upload a temporal payload json/i),
    ).toBeInTheDocument();
  });

  it("rejects an empty file", async () => {
    render(<TemporalWorkflowPayloadViewer />);
    const picker = screen.getByLabelText(/upload a json file/i) as HTMLInputElement;
    const file = makeFile("empty.json", "");
    Object.defineProperty(file, "size", { value: 0 });
    fireEvent.change(picker, { target: { files: [file] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/empty/i);
  });

  it("rejects an oversized file", async () => {
    render(<TemporalWorkflowPayloadViewer />);
    const picker = screen.getByLabelText(/upload a json file/i) as HTMLInputElement;
    const file = makeFile("huge.json", "x");
    Object.defineProperty(file, "size", { value: FILE_LIMIT_BYTES + 1 });
    fireEvent.change(picker, { target: { files: [file] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/exceeds/i);
  });

  it("accepts a valid file via the picker", async () => {
    render(<TemporalWorkflowPayloadViewer />);
    const picker = screen.getByLabelText(/upload a json file/i) as HTMLInputElement;
    const file = makeFile("payload.json", validDoc());
    fireEvent.change(picker, { target: { files: [file] } });
    expect(await screen.findByText("json/plain")).toBeInTheDocument();
  });

  it("accepts a drag-and-drop file", async () => {
    render(<TemporalWorkflowPayloadViewer />);
    const dropZone = screen.getByLabelText(/drop a .json file here/i);
    const file = makeFile("payload.json", validDoc());
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    expect(await screen.findByText("json/plain")).toBeInTheDocument();
  });

  it("makes no network calls", () => {
    render(<TemporalWorkflowPayloadViewer />);
    fireEvent.change(screen.getByLabelText(/payload json/i), {
      target: { value: validDoc() },
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(beaconSpy).not.toHaveBeenCalled();
  });
});