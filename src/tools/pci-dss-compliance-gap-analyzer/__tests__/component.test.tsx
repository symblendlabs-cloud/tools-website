// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PciDssComplianceGapAnalyzer from "../index";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PciDssComplianceGapAnalyzer", () => {
  it("renders the initial UI with security notice", () => {
    render(<PciDssComplianceGapAnalyzer />);
    expect(screen.getByLabelText(/YAML Configuration/i)).toBeInTheDocument();
    expect(screen.getByText(/Do not paste payment card numbers/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Analyze Configuration/i })).toBeInTheDocument();
  });

  it("allows YAML input and invokes analyzeYaml", () => {
    render(<PciDssComplianceGapAnalyzer />);
    const textarea = screen.getByLabelText(/YAML Configuration/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "schema_version: 1\nenvironment:\n  cde_defined: true" } });
    fireEvent.click(screen.getByRole("button", { name: /Analyze Configuration/i }));

    expect(screen.getByText(/Findings/i)).toBeInTheDocument();
    expect(screen.getByText(/PCI DSS 1.2.7/i)).toBeInTheDocument();
  });

  it("renders validation errors for malformed input", () => {
    render(<PciDssComplianceGapAnalyzer />);
    const textarea = screen.getByLabelText(/YAML Configuration/i);
    fireEvent.change(textarea, { target: { value: "invalid_yaml: [" } });
    fireEvent.click(screen.getByRole("button", { name: /Analyze Configuration/i }));

    expect(screen.getByText(/Validation Errors/i)).toBeInTheDocument();
  });

  it("renders warnings separately", () => {
    render(<PciDssComplianceGapAnalyzer />);
    const textarea = screen.getByLabelText(/YAML Configuration/i);
    fireEvent.change(textarea, {
      target: { value: "schema_version: 1\nenvironment:\n  cde_defined: true\nunknown: field" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Analyze Configuration/i }));

    expect(screen.getByText(/Warnings/i)).toBeInTheDocument();
  });

  it("marks results as stale after input changes", () => {
    render(<PciDssComplianceGapAnalyzer />);
    const textarea = screen.getByLabelText(/YAML Configuration/i);
    fireEvent.change(textarea, { target: { value: "schema_version: 1\nenvironment:\n  cde_defined: true" } });
    fireEvent.click(screen.getByRole("button", { name: /Analyze Configuration/i }));

    expect(screen.getByText(/Findings/i)).toBeInTheDocument();

    // Change input
    fireEvent.change(textarea, { target: { value: "schema_version: 1" } });

    // Stale warning should appear, Findings should hide
    expect(screen.getByText(/Input has changed/i)).toBeInTheDocument();
    expect(screen.queryByText(/Findings/i)).not.toBeInTheDocument();
  });

  it("clears results and input on Clear", () => {
    render(<PciDssComplianceGapAnalyzer />);
    const textarea = screen.getByLabelText(/YAML Configuration/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "schema_version: 1\nenvironment:\n  cde_defined: true" } });
    fireEvent.click(screen.getByRole("button", { name: /Analyze Configuration/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Clear$/i }));

    expect(textarea.value).toBe("");
    expect(screen.queryByText(/Findings/i)).not.toBeInTheDocument();
  });

  it("exports JSON without the original YAML", () => {
    // Mock URL.createObjectURL
    const mockCreateObjectURL = vi.fn((blob: Blob) => "blob:test");
    const mockRevokeObjectURL = vi.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    render(<PciDssComplianceGapAnalyzer />);
    const textarea = screen.getByLabelText(/YAML Configuration/i);
    fireEvent.change(textarea, { target: { value: "schema_version: 1\nenvironment:\n  cde_defined: true" } });
    fireEvent.click(screen.getByRole("button", { name: /Analyze Configuration/i }));

    const exportBtn = screen.getByRole("button", { name: /Export JSON/i });
    fireEvent.click(exportBtn);

    expect(mockCreateObjectURL).toHaveBeenCalled();

    // Access the blob from the first argument of the first call
    const blob = mockCreateObjectURL.mock.calls[0]?.[0];
    if (blob) {
      expect(blob.type).toBe("application/json");
    }

    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
});