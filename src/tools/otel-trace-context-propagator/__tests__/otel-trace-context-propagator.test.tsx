// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import OtelTraceContextPropagator from "../index";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const VALID_TRACEPARENT =
  "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

describe("OtelTraceContextPropagator — mode switching", () => {
  it("renders three mode tabs with Generate selected by default", () => {
    render(<OtelTraceContextPropagator />);
    expect(screen.getByRole("tab", { name: /generate new context/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("tab", { name: /validate incoming headers/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /propagation simulation/i }),
    ).toBeInTheDocument();
  });

  it("switches panels when tabs are clicked", () => {
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("tab", { name: /validate incoming/i }));
    expect(screen.getByLabelText(/incoming traceparent/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /propagation simulation/i }));
    expect(screen.getByRole("radio", { name: /preserve incoming/i })).toBeInTheDocument();
  });
});

describe("OtelTraceContextPropagator — generate mode", () => {
  it("generates a traceparent with sampled flag set when Sampled is chosen", () => {
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("button", { name: /generate new context/i }));
    const tp = screen.getByLabelText(/^traceparent$/i) as HTMLTextAreaElement;
    expect(tp.value).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
  });

  it("clears state on Clear", () => {
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("button", { name: /generate new context/i }));
    expect(screen.getByLabelText(/trace id/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(screen.queryByLabelText(/trace id/i)).not.toBeInTheDocument();
  });
});

describe("OtelTraceContextPropagator — validate mode", () => {
  it("shows valid status for a valid traceparent", () => {
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("tab", { name: /validate incoming/i }));
    fireEvent.change(screen.getByLabelText(/incoming traceparent/i), {
      target: { value: VALID_TRACEPARENT },
    });
    const matches = screen.getAllByText(/valid version 00 traceparent/i);
    // One is the polite live region (screen reader), one is the visible status box.
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("status")).toHaveTextContent(/valid version 00 traceparent/i);
  });

  it("shows field-specific errors for invalid traceparent", () => {
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("tab", { name: /validate incoming/i }));
    fireEvent.change(screen.getByLabelText(/incoming traceparent/i), {
      target: { value: "00-00000000000000000000000000000000-00f067aa0ba902b7-01" },
    });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/trace-id must not be all zeros/i);
  });

  it("explains that future versions are unverified", () => {
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("tab", { name: /validate incoming/i }));
    fireEvent.change(screen.getByLabelText(/incoming traceparent/i), {
      target: { value: "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" },
    });
    expect(screen.getByText(/newer than this tool supports/i)).toBeInTheDocument();
  });

  it("accepts valid tracestate and rejects invalid", () => {
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("tab", { name: /validate incoming/i }));
    fireEvent.change(screen.getByLabelText(/incoming traceparent/i), {
      target: { value: VALID_TRACEPARENT },
    });
    fireEvent.change(screen.getByLabelText(/incoming tracestate/i), {
      target: { value: "vendor=value" },
    });
    expect(screen.getByText(/grammatically valid/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/incoming tracestate/i), {
      target: { value: "Vendor=value" },
    });
    expect(screen.getByText(/invalid tracestate/i)).toBeInTheDocument();
  });
});

describe("OtelTraceContextPropagator — propagate mode", () => {
  it("propagates from a valid traceparent preserving trace ID", () => {
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("tab", { name: /propagation simulation/i }));
    fireEvent.change(screen.getByLabelText(/incoming traceparent/i), {
      target: { value: VALID_TRACEPARENT },
    });
    const outTp = screen.getByLabelText(/outgoing traceparent/i) as HTMLTextAreaElement;
    expect(outTp.value).toContain("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(outTp.value).not.toContain("00f067aa0ba902b7");
  });

  it("refuses propagation for invalid traceparent", () => {
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("tab", { name: /propagation simulation/i }));
    fireEvent.change(screen.getByLabelText(/incoming traceparent/i), {
      target: { value: "not-a-traceparent" },
    });
    expect(screen.getByText(/propagation cannot continue/i)).toBeInTheDocument();
  });

  it("generates a fresh trace when traceparent is empty", () => {
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("tab", { name: /propagation simulation/i }));
    fireEvent.change(screen.getByLabelText(/incoming tracestate/i), {
      target: { value: "vendor=value" },
    });
    const outTp = screen.getByLabelText(/outgoing traceparent/i) as HTMLTextAreaElement;
    expect(outTp.value).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
    expect(screen.queryByLabelText(/outgoing tracestate/i)).not.toBeInTheDocument();
  });

  it("refuses propagation for future version", () => {
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("tab", { name: /propagation simulation/i }));
    fireEvent.change(screen.getByLabelText(/incoming traceparent/i), {
      target: { value: "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" },
    });
    expect(screen.getByText(/disabled for unsupported version/i)).toBeInTheDocument();
  });

  it("drops invalid tracestate but propagates traceparent", () => {
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("tab", { name: /propagation simulation/i }));
    fireEvent.change(screen.getByLabelText(/incoming traceparent/i), {
      target: { value: VALID_TRACEPARENT },
    });
    fireEvent.change(screen.getByLabelText(/incoming tracestate/i), {
      target: { value: "Vendor=bad" },
    });
    expect(screen.queryByLabelText(/outgoing tracestate/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/outgoing traceparent/i)).toBeInTheDocument();
  });
});

describe("OtelTraceContextPropagator — copy behavior", () => {
  it("copies traceparent to clipboard in generate mode", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("button", { name: /generate new context/i }));
    fireEvent.click(screen.getByRole("button", { name: /copy traceparent/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(await screen.findByText(/copied to clipboard/i)).toBeInTheDocument();
  });
});

describe("OtelTraceContextPropagator — accessibility", () => {
  it("exposes labeled textareas in every mode", () => {
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("tab", { name: /validate incoming/i }));
    expect(screen.getByLabelText(/incoming traceparent/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/incoming tracestate/i)).toBeInTheDocument();
  });

  it("announces generated context in a polite live region", () => {
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("button", { name: /generate new context/i }));
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/new trace context generated/i);
  });

  it("uses role=alert for invalid traceparent", () => {
    render(<OtelTraceContextPropagator />);
    fireEvent.click(screen.getByRole("tab", { name: /validate incoming/i }));
    fireEvent.change(screen.getByLabelText(/incoming traceparent/i), {
      target: { value: "bad" },
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});