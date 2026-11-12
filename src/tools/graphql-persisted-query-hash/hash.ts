export type HashResult =
  | { ok: true; hash: string; apqJson: string }
  | { ok: false; error: string };

export const MAX_INPUT_BYTES = 1024 * 1024; // 1 MiB

export function utf8ByteLength(input: string): number {
  return new TextEncoder().encode(input).length;
}

export function apqJsonFor(hash: string): string {
  return JSON.stringify(
    { persistedQuery: { version: 1, sha256Hash: hash } },
    null,
    2,
  );
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Hashes the EXACT input string. No trim, no normalize, no reformat.
 * Empty input is rejected (there is nothing to hash and APQ would be meaningless).
 */
export async function hashGraphQLSource(source: string): Promise<HashResult> {
  if (source.length === 0) {
    return { ok: false, error: "Enter a GraphQL query to hash." };
  }

  const bytes = new TextEncoder().encode(source);
  if (bytes.length > MAX_INPUT_BYTES) {
    return {
      ok: false,
      error: `Input exceeds the ${MAX_INPUT_BYTES}-byte limit.`,
    };
  }

  if (
    typeof globalThis.crypto === "undefined" ||
    typeof globalThis.crypto.subtle === "undefined"
  ) {
    return {
      ok: false,
      error:
        "Web Crypto is unavailable in this browser. Use a modern browser over HTTPS or localhost.",
    };
  }

  try {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const hash = toHex(digest);
    return { ok: true, hash, apqJson: apqJsonFor(hash) };
  } catch {
    return { ok: false, error: "Hashing failed. Please try again." };
  }
}