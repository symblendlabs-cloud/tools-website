import YAML from "yaml";

export type Direction = "json-to-yaml" | "yaml-to-json";

export type ConversionResult =
  | { ok: true; output: string }
  | { ok: false; error: string };

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function formatJsonError(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "Invalid JSON input.";
}

function formatYamlError(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "Invalid YAML input.";
}

export function convertJsonToYaml(input: string): ConversionResult {
  if (isBlank(input)) {
    return { ok: true, output: "" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    return { ok: false, error: formatJsonError(err) };
  }
  try {
    const output = YAML.stringify(parsed, { indent: 2 });
    return { ok: true, output };
  } catch (err) {
    return { ok: false, error: formatYamlError(err) };
  }
}

export function convertYamlToJson(input: string): ConversionResult {
  if (isBlank(input)) {
    return { ok: true, output: "" };
  }

  let docs: unknown[];
  try {
    const parsed = YAML.parseAllDocuments(input);
    const errors = parsed.flatMap((doc) => doc.errors);
    if (errors.length > 0) {
      const first = errors[0];
      return {
        ok: false,
        error: first && first.message ? first.message : "Invalid YAML input.",
      };
    }
    docs = parsed.map((doc) => doc.toJS());
  } catch (err) {
    return { ok: false, error: formatYamlError(err) };
  }

  let jsonValue: unknown;
  if (docs.length === 0) {
    // No documents at all (only whitespace/frontmatter) — return empty output.
    return { ok: true, output: "" };
  } else if (docs.length === 1) {
    jsonValue = docs[0] === undefined ? null : docs[0];
  } else {
    jsonValue = docs.map((d) => (d === undefined ? null : d));
  }

  try {
    const output = JSON.stringify(jsonValue, null, 2);
    return { ok: true, output };
  } catch (err) {
    return { ok: false, error: formatJsonError(err) };
  }
}

export function convert(direction: Direction, input: string): ConversionResult {
  return direction === "json-to-yaml"
    ? convertJsonToYaml(input)
    : convertYamlToJson(input);
}