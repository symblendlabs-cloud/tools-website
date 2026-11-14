// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import EbpfTracepointSyntaxHelper from "../index";


afterEach(() => {
  cleanup();
});

describe("EbpfTracepointSyntaxHelper", () => {
  it("renders the configuration controls", () => {
    render(<EbpfTracepointSyntaxHelper />);
    expect(screen.getByLabelText(/^category$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^event$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/program name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/context struct name/i)).toBeInTheDocument();
  });

  it("renders the format file textarea with the default example", () => {
    render(<EbpfTracepointSyntaxHelper />);
    const format = screen.getByLabelText(/linux tracepoint format file/i) as HTMLTextAreaElement;
    expect(format.value).toContain("sys_enter_openat");
    expect(format.value).toContain("field:int dfd");
  });

  it("parses the default example and shows the field table", () => {
    render(<EbpfTracepointSyntaxHelper />);
    expect(screen.getByText(/9 field\(s\) parsed/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /select field dfd/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /select field filename/i })).toBeInTheDocument();
  });

  it("classifies filename as a pointer in the Kind column", () => {
  render(<EbpfTracepointSyntaxHelper />);
  const row = screen.getByRole("row", { name: /filename/i });
  expect(within(row).getByText("pointer")).toBeInTheDocument();
});

  it("common fields are not selectable", () => {
    render(<EbpfTracepointSyntaxHelper />);
    const commonPid = screen.getByRole("checkbox", { name: /select field common_pid/i });
    expect(commonPid).toBeDisabled();
  });

  it("Generate code produces a textarea with SEC and license", () => {
    render(<EbpfTracepointSyntaxHelper />);
    fireEvent.click(screen.getByRole("button", { name: /generate code/i }));
    const editor = screen.getByLabelText(/generated c code/i) as HTMLTextAreaElement;
    expect(editor.value).toContain('SEC("tracepoint/syscalls/sys_enter_openat")');
    expect(editor.value).toContain('SEC("license")');
  });

  it("Validate code shows no issues for the generated code", async () => {
    render(<EbpfTracepointSyntaxHelper />);
    fireEvent.click(screen.getByRole("button", { name: /generate code/i }));
    fireEvent.click(screen.getByRole("button", { name: /validate code/i }));
    await waitFor(() => {
      expect(screen.getByText(/no issues detected by static checks/i)).toBeInTheDocument();
    });
  });

  it("Clear resets all inputs", () => {
    render(<EbpfTracepointSyntaxHelper />);
    fireEvent.click(screen.getByRole("button", { name: /generate code/i }));
    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    const category = screen.getByLabelText(/^category$/i) as HTMLInputElement;
    expect(category.value).toBe("syscalls");
    const format = screen.getByLabelText(/linux tracepoint format file/i) as HTMLTextAreaElement;
    expect(format.value).toBe("");
    expect(screen.queryByLabelText(/generated c code/i)).toBeInTheDocument();
    const editor = screen.getByLabelText(/generated c code/i) as HTMLTextAreaElement;
    expect(editor.value).toBe("");
  });

  it("Copy calls the clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<EbpfTracepointSyntaxHelper />);
    fireEvent.click(screen.getByRole("button", { name: /generate code/i }));
    fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(await screen.findByText(/copied to clipboard/i)).toBeInTheDocument();
  });

  it("shows parse errors for malformed format input", () => {
    render(<EbpfTracepointSyntaxHelper />);
    const format = screen.getByLabelText(/linux tracepoint format file/i);
    fireEvent.change(format, { target: { value: "not a format file" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});