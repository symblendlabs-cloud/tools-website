// W3C Trace Context Level 2 — tracestate grammar validation.
//
// Reference:
//   https://www.w3.org/TR/trace-context-2/#list-members
//
// Grammar (RFC 5234 style):
//   list       = list-member 0*31( OWS "," OWS list-member )
//   list-member = key OWS "=" OWS value
//   key        = ( lcalpha / DIGIT ) 0*255( keychar )
//   keychar    = lcalpha / DIGIT / "_" / "-" / "*" / "/" / "@"
//   OWS        = *( SP / HTAB )
//   value      = 0*255(chr) nblk-chr
//   chr        = %x20-7E
//   nblk-chr   = %x21-2B / %x2D-3C / %x3E-7E   ; printable ASCII except SP, ",", "="
//
// Whitespace handling follows the assignment's explicit examples:
//   - Leading SP/HTAB in a value is preserved (it belongs to the value).
//   - Trailing SP/HTAB after a value is OWS and is not part of the value.
//   - OWS around the comma separators and around "=" is tolerated.
//   - Tabs, newlines, and other non-printable characters inside a value are invalid.
//   - A value must contain at least one non-space final character.
//
// This module is pure. It does not interpret vendor-specific keys or values.

export const MAX_LIST_MEMBERS = 32;
export const MAX_KEY_LENGTH = 256;
export const MAX_VALUE_LENGTH = 256;
export const RECOMMENDED_COMBINED_LENGTH = 512;

const KEY_FIRST_RE = /^[a-z0-9]$/;
const KEYCHAR_RE = /^[a-z0-9_\-*/@]$/;

function isKeyFirst(c: string | undefined): boolean {
  return c !== undefined && KEY_FIRST_RE.test(c);
}

function isKeychar(c: string | undefined): boolean {
  return c !== undefined && KEYCHAR_RE.test(c);
}

function isOws(c: string | undefined): boolean {
  return c === " " || c === "\t";
}

function stripLeadingOws(s: string): string {
  let i = 0;
  while (i < s.length && isOws(s[i])) i++;
  return s.slice(i);
}

function stripTrailingOws(s: string): string {
  let end = s.length;
  while (end > 0 && isOws(s[end - 1])) end--;
  return s.slice(0, end);
}

function validateKey(key: string, index: number): string[] {
  const errors: string[] = [];
  const memberLabel = `member ${index + 1}`;

  if (key.length === 0) {
    errors.push(`${memberLabel}: key is empty.`);
    return errors;
  }
  if (key.length > MAX_KEY_LENGTH) {
    errors.push(`${memberLabel}: key exceeds ${MAX_KEY_LENGTH} characters.`);
    return errors;
  }
  if (!isKeyFirst(key[0])) {
    errors.push(
      `${memberLabel}: key must start with a lowercase letter or digit.`,
    );
    return errors;
  }
  for (let i = 1; i < key.length; i++) {
    if (!isKeychar(key[i])) {
      errors.push(
        `${memberLabel}: key contains a disallowed character at position ${i + 1}.`,
      );
      return errors;
    }
  }
  return errors;
}

function validateValue(value: string, index: number): string[] {
  const errors: string[] = [];
  const memberLabel = `member ${index + 1}`;

  if (value.length === 0) {
    errors.push(`${memberLabel}: value is empty.`);
    return errors;
  }
  if (value.length > MAX_VALUE_LENGTH) {
    errors.push(`${memberLabel}: value exceeds ${MAX_VALUE_LENGTH} characters.`);
    return errors;
  }
  for (let i = 0; i < value.length; i++) {
    const cp = value.charCodeAt(i);
    if (cp < 0x20 || cp > 0x7e) {
      errors.push(
        `${memberLabel}: value contains a non-printable or non-ASCII character at position ${i + 1}.`,
      );
      return errors;
    }
    if (cp === 0x2c || cp === 0x3d) {
      errors.push(
        `${memberLabel}: value must not contain "," or "=" at position ${i + 1}.`,
      );
      return errors;
    }
  }
  // The grammar requires the final character to be nblk-chr.
  if (value.endsWith(" ")) {
    errors.push(`${memberLabel}: value must not end with a space.`);
  }
  return errors;
}

export interface TracestateEntry {
  key: string;
  value: string;
}

export interface TracestateParseResult {
  ok: boolean;
  entries: TracestateEntry[];
  errors: string[];
  warnings: string[];
}

/**
 * Parse a tracestate header. Empty and OWS-only members are skipped (the
 * specification requires implementations to tolerate them). Ordering of
 * valid members is preserved. Leading SP/HTAB in a value is preserved;
 * trailing SP/HTAB is treated as OWS and stripped. Duplicate keys are
 * reported.
 */
export function parseTracestate(input: string): TracestateParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const entries: TracestateEntry[] = [];
  const seenKeys = new Set<string>();

  if (input.length === 0) {
    return { ok: true, entries, errors, warnings };
  }

  if (input.length > RECOMMENDED_COMBINED_LENGTH) {
    warnings.push(
      `tracestate length is ${input.length} characters; the W3C Trace Context Level 2 draft recommends limiting combined propagation size to ${RECOMMENDED_COMBINED_LENGTH} characters. This is a recommendation, not a hard limit.`,
    );
  }

  const members = input.split(",");
  if (members.length > MAX_LIST_MEMBERS) {
    errors.push(
      `tracestate has ${members.length} list members; the maximum is ${MAX_LIST_MEMBERS}.`,
    );
  }

  for (let i = 0; i < members.length; i++) {
    const raw = members[i] ?? "";

    // Strip OWS from both ends of the member. Leading OWS comes from the
    // comma separator; trailing OWS comes from the comma separator or the
    // end of the header. Trailing OWS after a value is not part of the
    // value, so stripping it is correct — the value grammar forbids a
    // trailing space anyway.
    const member = stripTrailingOws(stripLeadingOws(raw));

    // Skip empty and OWS-only members.
    if (member.length === 0) continue;

    const eq = member.indexOf("=");
    if (eq < 0) {
      errors.push(`member ${i + 1}: missing "=" separator.`);
      continue;
    }

    // OWS around "=" — strip leading/trailing OWS from the key part only.
    // The value part preserves whatever follows "=" verbatim (no leading
    // strip), because the assignment requires leading SP in a value to be
    // preserved. Trailing OWS on the value was already stripped above.
    const keyPart = stripTrailingOws(member.slice(0, eq));
    const valuePart = member.slice(eq + 1);

    const keyErrors = validateKey(keyPart, i);
    const valueErrors = validateValue(valuePart, i);
    errors.push(...keyErrors, ...valueErrors);

    if (keyErrors.length === 0 && valueErrors.length === 0) {
      if (seenKeys.has(keyPart)) {
        errors.push(`member ${i + 1}: duplicate key "${keyPart}".`);
      } else {
        seenKeys.add(keyPart);
        entries.push({ key: keyPart, value: valuePart });
      }
    }
  }

  return { ok: errors.length === 0, entries, errors, warnings };
}

/** Serialize entries back to a canonical tracestate string. */
export function formatTracestate(entries: readonly TracestateEntry[]): string {
  return entries.map((e) => `${e.key}=${e.value}`).join(",");
}