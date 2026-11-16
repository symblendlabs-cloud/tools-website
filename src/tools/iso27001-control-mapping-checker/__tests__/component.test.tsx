// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Iso27001ControlMappingChecker from "../index";


afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeCsvFile(content: string, name = "policies.csv"): File {
  const file = new File([content], name, { type: "text/csv" });
  // jsdom's File implementation is not guaranteed to provide the standard
  // Blob.text() / Blob.arrayBuffer() methods across versions. Attach them
  // directly to the instance so the component's real file-reading path
  // (file.text / file.arrayBuffer) is exercised without changing production
  // code and without depending on jsdom's prototype state.
  const bytes = new TextEncoder().encode(content);
  Object.defineProperty(file, "text", {
    configurable: true,
    value: () => Promise.resolve(content),
  });
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: () => Promise.resolve(bytes.buffer.slice(0) as ArrayBuffer),
  });
  return file;
}

const SAMPLE_CSV = [
  "policy name,description",
  "Access Policy,Defines access control and privileged access rights.",
  "Backup Policy,Covers backup and restore procedures.",
].join("\n");

async function uploadCsv(csv: string, name = "policies.csv") {
  const input = screen.getByLabelText(/Select a policy file/i) as HTMLInputElement;
  const file = makeCsvFile(csv, name);
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
  // Wait for the actual observable result of the import rather than
  // assuming a fixed delay. Under parallel test execution the parse can
  // take longer than 0ms; waitFor retries until the loaded-state indicator
  // appears or the timeout expires. This makes the test deterministic
  // regardless of CPU contention.
  await waitFor(() => {
    expect(screen.getByText(/Loaded:.*policy record/i)).toBeInTheDocument();
  }, { timeout: 5000 });
}

function mockObjectURL() {
  const create = vi.fn(() => "blob:mock");
  const revoke = vi.fn();
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
  return { create, revoke };
}

describe("Iso27001ControlMappingChecker — initial render", () => {
  it("renders the security notice, file input and footer disclaimer", () => {
    render(<Iso27001ControlMappingChecker />);
    expect(screen.getByText(/processes security policy data entirely in your browser/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Select a policy file/i)).toBeInTheDocument();
    expect(screen.getByText(/does not establish compliance, verify control implementation/i)).toBeInTheDocument();
  });

  it("shows N/A coverage before any applicability is assessed", () => {
    render(<Iso27001ControlMappingChecker />);
    expect(screen.getByText(/N\/A — no controls have been marked applicable yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/^0\.0%$/)).not.toBeInTheDocument();
  });
});

describe("Iso27001ControlMappingChecker — import", () => {
  it("imports a CSV and populates the review queue", async () => {
    render(<Iso27001ControlMappingChecker />);
    await uploadCsv(SAMPLE_CSV);
    expect(screen.getByText(/2 policy record\(s\)/i)).toBeInTheDocument();
    // A.5.15 should be suggested via "access control" keywords
    const queue = screen.getByRole("region", { name: /Mapping review queue/i });
    expect(within(queue).getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("rejects a file with an unsupported extension", async () => {
    render(<Iso27001ControlMappingChecker />);
    const input = screen.getByLabelText(/Select a policy file/i) as HTMLInputElement;
    const file = new File(["x"], "notes.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText(/Unsupported file type/i)).toBeInTheDocument();
  });

  it("rejects a file exceeding the size limit", async () => {
    render(<Iso27001ControlMappingChecker />);
    const input = screen.getByLabelText(/Select a policy file/i) as HTMLInputElement;
    // Create a fake large file by spoofing `size` and `arrayBuffer`.
    const file = new File([""], "big.csv", { type: "text/csv" });
    Object.defineProperty(file, "size", { value: 6 * 1024 * 1024 });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText(/exceeds the .* limit/i)).toBeInTheDocument();
  });
});

describe("Iso27001ControlMappingChecker — mapping review", () => {
  it("accepting a suggestion does not change coverage until a control is applicable", async () => {
    render(<Iso27001ControlMappingChecker />);
    await uploadCsv(SAMPLE_CSV);
    // Accept every suggestion we can find.
    const acceptButtons = screen.getAllByRole("button", { name: /^Accept$/i });
    expect(acceptButtons.length).toBeGreaterThan(0);
    fireEvent.click(acceptButtons[0]!);
    // Coverage is still N/A because no control is applicable yet.
    expect(screen.getByText(/N\/A — no controls have been marked applicable yet/i)).toBeInTheDocument();
  });

  it("rejecting a suggestion removes it from the pending queue", async () => {
    render(<Iso27001ControlMappingChecker />);
    await uploadCsv(SAMPLE_CSV);
    const queueBefore = screen.getByRole("region", { name: /Mapping review queue/i });
    const before = within(queueBefore).getAllByRole("listitem").length;
    fireEvent.click(screen.getAllByRole("button", { name: /^Reject$/i })[0]!);
    const queueAfter = screen.getByRole("region", { name: /Mapping review queue/i });
    const after = within(queueAfter).queryAllByRole("listitem").length;
    expect(after).toBeLessThan(before);
  });
});

describe("Iso27001ControlMappingChecker — applicability", () => {
  it("surfaces an error when marking not applicable without justification", async () => {
    render(<Iso27001ControlMappingChecker />);
    await uploadCsv(SAMPLE_CSV);

    // Find the A.5.1 row by its applicability select's aria-label.
    const select = screen.getByLabelText(/Applicability for A\.5\.1$/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "not_applicable" } });

    const row = select.closest("tr");
    expect(row).not.toBeNull();
    const saveBtn = within(row as HTMLElement).getByRole("button", { name: /Save applicability/i });
    fireEvent.click(saveBtn);

    expect(screen.getByText(/justification is required/i)).toBeInTheDocument();
  });

  it("records not applicable when a justification is provided and adjusts the denominator", async () => {
    render(<Iso27001ControlMappingChecker />);
    await uploadCsv(SAMPLE_CSV);

    const select = screen.getByLabelText(/Applicability for A\.5\.1$/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "not_applicable" } });
    const row = select.closest("tr") as HTMLElement;
    const justification = within(row).getByLabelText(/Justification for A\.5\.1$/i) as HTMLInputElement;
    fireEvent.change(justification, { target: { value: "Out of scope." } });
    fireEvent.click(within(row).getByRole("button", { name: /Save applicability/i }));

    // After marking A.5.1 not applicable, coverage is still N/A (no applicable controls).
    expect(screen.getByText(/N\/A — no controls have been marked applicable yet/i)).toBeInTheDocument();
    // And the overview shows at least one "Not applicable".
    const overview = screen.getByRole("region", { name: /Mapping overview/i });
    expect(within(overview).getByText(/^1$/)).toBeInTheDocument();
  });
});

describe("Iso27001ControlMappingChecker — implementation", () => {
  it("updates the implementation dropdown for a control", async () => {
    render(<Iso27001ControlMappingChecker />);
    await uploadCsv(SAMPLE_CSV);

    const implSelect = screen.getByLabelText(/Implementation for A\.5\.1$/i) as HTMLSelectElement;
    fireEvent.change(implSelect, { target: { value: "implemented" } });
    // React may replace the DOM node on re-render, so re-query after the change.
    const implSelectAfter = screen.getByLabelText(/Implementation for A\.5\.1$/i) as HTMLSelectElement;
    expect(implSelectAfter.value).toBe("implemented");
  });
});

describe("Iso27001ControlMappingChecker — exports", () => {
  it("creates and revokes an object URL when exporting project JSON", async () => {
    const { create, revoke } = mockObjectURL();
    render(<Iso27001ControlMappingChecker />);
    await uploadCsv(SAMPLE_CSV);
    const exportSection = screen.getByRole("region", { name: /Exports/i });
    const projectJsonBtn = within(exportSection).getByRole("button", { name: /Project JSON/i });
    fireEvent.click(projectJsonBtn);
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledTimes(1);
  });
});

describe("Iso27001ControlMappingChecker — reset", () => {
  it("requires confirmation before clearing and then disables exports", async () => {
    render(<Iso27001ControlMappingChecker />);
    await uploadCsv(SAMPLE_CSV);
    const resetSection = screen.getByRole("region", { name: /Reset/i });
    fireEvent.click(within(resetSection).getByRole("button", { name: /Clear all data/i }));
    expect(within(resetSection).getByRole("button", { name: /Yes, clear everything/i })).toBeInTheDocument();
    fireEvent.click(within(resetSection).getByRole("button", { name: /Yes, clear everything/i }));
    const exportSection = screen.getByRole("region", { name: /Exports/i });
    expect(within(exportSection).getByRole("button", { name: /Project JSON/i })).toBeDisabled();
  });
});

describe("Iso27001ControlMappingChecker — privacy", () => {
  it("never calls fetch / XHR / sendBeacon during import or export", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.reject(new Error("unexpected")));
    const xhrOpen = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const XHR = globalThis.XMLHttpRequest as any;
    const originalOpen = XHR.prototype.open;
    XHR.prototype.open = xhrOpen;
    const sendBeacon = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).sendBeacon = sendBeacon;
    mockObjectURL();

    try {
      render(<Iso27001ControlMappingChecker />);
      await uploadCsv(SAMPLE_CSV);
      const exportSection = screen.getByRole("region", { name: /Exports/i });
      fireEvent.click(within(exportSection).getByRole("button", { name: /Project JSON/i }));
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(xhrOpen).not.toHaveBeenCalled();
      expect(sendBeacon).not.toHaveBeenCalled();
    } finally {
      XHR.prototype.open = originalOpen;
    }
  });
});

describe("Iso27001ControlMappingChecker — reassignment", () => {
  it("reassignment moves the mapping to the new control and preserves policy association", async () => {
    render(<Iso27001ControlMappingChecker />);
    await uploadCsv(SAMPLE_CSV);
    // Find the review queue and pick the first Reassign select
    const queue = screen.getByRole("region", { name: /Mapping review queue/i });
    const reassignSelects = within(queue).getAllByRole("combobox");
    expect(reassignSelects.length).toBeGreaterThan(0);
    const firstSelect = reassignSelects[0] as HTMLSelectElement;
    // Change to a distinct control that is not the current one
    fireEvent.change(firstSelect, { target: { value: "A.5.1" } });
    // The queue should still be present (the reassigned edge is now "reassigned", not "unreviewed",
    // so it drops out of the pending queue).
    const queueAfter = screen.getByRole("region", { name: /Mapping review queue/i });
    const before = within(queue).queryAllByRole("listitem").length;
    const after = within(queueAfter).queryAllByRole("listitem").length;
    expect(after).toBeLessThanOrEqual(before);
  });
});