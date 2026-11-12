// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as hashModule from "../hash";
import {
  hashGraphQLSource,
  apqJsonFor,
  utf8ByteLength,
  type HashResult,
} from "../hash";
import GraphQLPersistedQueryHash from "../index";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Known SHA-256 vector for "hello world"
const HELLO_WORLD_HASH =
  "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

describe("hashGraphQLSource", () => {
  it("matches the known SHA-256 vector for 'hello world'", async () => {
    const result = await hashGraphQLSource("hello world");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.hash).toBe(HELLO_WORLD_HASH);
  });

  it("produces exactly 64 lowercase hex characters", async () => {
    const result = await hashGraphQLSource("{ __typename }");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hash).toHaveLength(64);
      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("hashes the exact source: leading/trailing whitespace changes the hash", async () => {
    const a = await hashGraphQLSource("{__typename}");
    const b = await hashGraphQLSource(" {__typename} ");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.hash).not.toBe(b.hash);
  });

  it("hashes the exact source: internal whitespace changes the hash", async () => {
    const a = await hashGraphQLSource("{ __typename }");
    const b = await hashGraphQLSource("{\n  __typename\n}");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.hash).not.toBe(b.hash);
  });

  it("rejects empty input", async () => {
    const result = await hashGraphQLSource("");
    expect(result.ok).toBe(false);
  });

  it("returns the APQ v1 extension JSON matching the hash", async () => {
    const result = await hashGraphQLSource("hello world");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(result.apqJson)).toEqual({
        persistedQuery: { version: 1, sha256Hash: HELLO_WORLD_HASH },
      });
    }
  });

  it("reports an error when Web Crypto is unavailable", async () => {
    const original = globalThis.crypto;
    // @ts-expect-error simulate missing crypto
    delete globalThis.crypto;
    try {
      const result = await hashGraphQLSource("{ a }");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/Web Crypto/i);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        value: original,
        configurable: true,
      });
    }
  });
});

describe("apqJsonFor", () => {
  it("wraps a hash in the Apollo APQ v1 shape", () => {
    expect(JSON.parse(apqJsonFor(HELLO_WORLD_HASH))).toEqual({
      persistedQuery: { version: 1, sha256Hash: HELLO_WORLD_HASH },
    });
  });
});

describe("utf8ByteLength", () => {
  it("counts ASCII and multi-byte characters correctly", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("😀")).toBe(4);
  });
});

describe("GraphQLPersistedQueryHash component", () => {
  it("renders editor and controls", () => {
    render(<GraphQLPersistedQueryHash />);
    expect(screen.getByLabelText(/graphql source/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate hash/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^clear$/i })).toBeInTheDocument();
  });

  it("shows live UTF-16 code unit and UTF-8 byte counts", () => {
    render(<GraphQLPersistedQueryHash />);
    fireEvent.change(screen.getByLabelText(/graphql source/i), {
      target: { value: "é" },
    });
    expect(screen.getByText(/1 UTF-16 code units/i)).toBeInTheDocument();
    expect(screen.getByText(/2 UTF-8 bytes/i)).toBeInTheDocument();
  });

  it("generates and displays a hash and APQ JSON", async () => {
    render(<GraphQLPersistedQueryHash />);
    fireEvent.change(screen.getByLabelText(/graphql source/i), {
      target: { value: "hello world" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate hash/i }));
    await waitFor(() => {
      const hashField = screen.getByLabelText(/sha-256 hash/i) as HTMLTextAreaElement;
      expect(hashField.value).toBe(HELLO_WORLD_HASH);
    });
    const apqField = screen.getByLabelText(/apollo apq v1 extension/i) as HTMLTextAreaElement;
    expect(JSON.parse(apqField.value).persistedQuery.sha256Hash).toBe(HELLO_WORLD_HASH);
  });

  it("clears state on Clear", async () => {
    render(<GraphQLPersistedQueryHash />);
    const input = screen.getByLabelText(/graphql source/i) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "hello world" } });
    fireEvent.click(screen.getByRole("button", { name: /generate hash/i }));
    await screen.findByLabelText(/sha-256 hash/i);
    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(input.value).toBe("");
    expect(screen.queryByLabelText(/sha-256 hash/i)).not.toBeInTheDocument();
  });

  it("copies the hash to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<GraphQLPersistedQueryHash />);
    fireEvent.change(screen.getByLabelText(/graphql source/i), {
      target: { value: "hello world" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate hash/i }));
    await screen.findByLabelText(/sha-256 hash/i);
    fireEvent.click(screen.getByRole("button", { name: /copy hash/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(HELLO_WORLD_HASH));
    expect(await screen.findByText(/copied to clipboard/i)).toBeInTheDocument();
  });

  // ─── Regression: stale-result race ─────────────────────────────────
  it("discards an in-flight hash when the query changes before it resolves", async () => {
    const STALE = "a".repeat(64);
    const FRESH = "b".repeat(64);

    let releaseFirst!: (r: HashResult) => void;
    const firstPromise = new Promise<HashResult>((resolve) => {
      releaseFirst = resolve;
    });

    vi.spyOn(hashModule, "hashGraphQLSource")
      .mockImplementationOnce(() => firstPromise)
      .mockResolvedValueOnce({ ok: true, hash: FRESH, apqJson: apqJsonFor(FRESH) });

    render(<GraphQLPersistedQueryHash />);
    const input = screen.getByLabelText(/graphql source/i) as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: "query A" } });
    fireEvent.click(screen.getByRole("button", { name: /generate hash/i }));

    // Editing must remain possible while hashing.
    fireEvent.change(input, { target: { value: "query B" } });
    expect(input.value).toBe("query B");

    // Stale promise resolves late — must not surface.
    releaseFirst({ ok: true, hash: STALE, apqJson: apqJsonFor(STALE) });
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.queryByDisplayValue(STALE)).not.toBeInTheDocument();

    // The user can generate a fresh hash for the new query.
    fireEvent.click(screen.getByRole("button", { name: /generate hash/i }));
    await waitFor(() => {
      const hashField = screen.getByLabelText(/sha-256 hash/i) as HTMLTextAreaElement;
      expect(hashField.value).toBe(FRESH);
    });
  });

  // ─── Accessibility ─────────────────────────────────────────────────
  it("exposes accessible names for every textarea and action", () => {
    render(<GraphQLPersistedQueryHash />);
    expect(screen.getByLabelText(/graphql source/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate hash/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy hash/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy apq json/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^clear$/i })).toBeInTheDocument();
  });

  it("announces hashing progress via a polite live region", async () => {
    let release!: (r: HashResult) => void;
    const pending = new Promise<HashResult>((resolve) => {
      release = resolve;
    });
    vi.spyOn(hashModule, "hashGraphQLSource").mockImplementationOnce(() => pending);

    render(<GraphQLPersistedQueryHash />);
    fireEvent.change(screen.getByLabelText(/graphql source/i), {
      target: { value: "hello world" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate hash/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/hashing/i);

    release({ ok: true, hash: HELLO_WORLD_HASH, apqJson: apqJsonFor(HELLO_WORLD_HASH) });
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/hash ready/i);
    });
  });

  it("uses role=alert for errors", async () => {
    vi.spyOn(hashModule, "hashGraphQLSource").mockResolvedValueOnce({
      ok: false,
      error: "boom",
    });
    render(<GraphQLPersistedQueryHash />);
    fireEvent.change(screen.getByLabelText(/graphql source/i), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate hash/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("boom");
  });
});