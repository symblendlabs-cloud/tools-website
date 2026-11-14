import YAML from "yaml";
import { validateSchema, checkInputSize, checkNestingDepth, type AnalyzerInput } from "./schema";
import { ALL_RULES, type RuleResult } from "./rules";

export interface Finding {
  ruleId: string;
  requirement: string;
  description: string;
  status: RuleResult["status"];
  evidence: string;
  remediation: string;
  officialRef: string;
}

export interface AnalysisResult {
  ok: boolean;
  findings: Finding[];
  validationErrors: string[];
  warnings: string[];
}

export function analyzeYaml(raw: string): AnalysisResult {
  const result: AnalysisResult = {
    ok: false,
    findings: [],
    validationErrors: [],
    warnings: [],
  };

  // 1. Validate raw input type
  if (typeof raw !== "string") {
    result.validationErrors.push("Input must be a string.");
    return result;
  }

  // 2. Check input size (256 KB)
  const sizeError = checkInputSize(raw);
  if (sizeError) {
    result.validationErrors.push(sizeError);
    return result;
  }

  // 3. Parse YAML safely with verified options
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw, {
      maxAliasCount: 100, // Default is 100; explicit for clarity
      uniqueKeys: true,   // Reject duplicate keys (default)
    });
  } catch (err) {
    result.validationErrors.push(`YAML parse error: ${(err as Error).message}`);
    return result;
  }

  // 4. Reject non-object structures (arrays, primitives)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    result.validationErrors.push("YAML root must be an object.");
    return result;
  }

  // 5. Check nesting depth (max 10)
  const depthError = checkNestingDepth(parsed);
  if (depthError) {
    result.validationErrors.push(depthError);
    return result;
  }

  // 6. Validate schema
  const schemaResult = validateSchema(parsed);
  if (!schemaResult.ok) {
    result.validationErrors = schemaResult.errors;
    result.warnings = schemaResult.warnings;
    return result;
  }

  // Attach schema warnings (unknown properties) to result
  result.warnings = schemaResult.warnings;

  // 7. Cast to AnalyzerInput and run rules
  const input = parsed as AnalyzerInput;

  for (const rule of ALL_RULES) {
    const ruleResult = rule.evaluate(input);
    result.findings.push({
      ruleId: rule.id,
      requirement: rule.requirement,
      description: rule.description,
      status: ruleResult.status,
      evidence: ruleResult.evidence,
      remediation: ruleResult.remediation,
      officialRef: ruleResult.officialRef,
    });
  }

  result.ok = true;
  return result;
}