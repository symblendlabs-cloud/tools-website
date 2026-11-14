import { useState } from "react";
import { analyzeYaml, type AnalysisResult, type Finding } from "./analyzer";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const TEXTAREA_CLASS = `mt-2 w-full resize-y rounded-md border border-input-border bg-input p-3 font-mono text-sm text-foreground ${FOCUS_RING}`;

const STATUS_LABELS: Record<Finding["status"], string> = {
  gap: "Potential Configuration Gap",
  "evidence-present": "Configuration Evidence Present (Not Verified)",
  manual: "Manual Verification Required",
  insufficient: "Insufficient Configuration Information",
  "not-evaluated": "Not Evaluated",
};

const STATUS_COLORS: Record<Finding["status"], string> = {
  gap: "border-destructive bg-destructive-muted text-destructive",
  "evidence-present": "border-green-600 bg-green-50 text-green-800",
  manual: "border-yellow-600 bg-yellow-50 text-yellow-800",
  insufficient: "border-gray-400 bg-gray-100 text-gray-700",
  "not-evaluated": "border-gray-300 bg-gray-50 text-gray-500",
};

export default function PciDssComplianceGapAnalyzer() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyzedInput, setAnalyzedInput] = useState("");

  function handleAnalyze() {
    const res = analyzeYaml(input);
    setResult(res);
    setAnalyzedInput(input);
  }

  function handleClear() {
    setInput("");
    setResult(null);
    setAnalyzedInput("");
  }

  function handleExport() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pci-dss-analysis-report.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Prevent stale results from showing if the user edits after analyzing
  const isStale = result !== null && input !== analyzedInput;
  const displayResult = isStale ? null : result;

  return (
    <div className="rounded-lg border border-border bg-surface">
      {/* Security Notice */}
      <div className="border-b border-border bg-yellow-50 p-4">
        <p className="text-sm font-medium text-yellow-800">
          Do not paste payment card numbers (PAN), passwords, private keys,
          production secrets, or other sensitive information. Analysis runs
          locally in your browser.
        </p>
      </div>

      {/* Input Section */}
      <div className="border-b border-border p-4">
        <label htmlFor="pci-yaml-input" className="block text-sm font-medium text-foreground">
          YAML Configuration
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste your payment infrastructure configuration to identify potential
          PCI DSS configuration gaps.
        </p>
        <textarea
          id="pci-yaml-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={12}
          spellCheck={false}
          className={TEXTAREA_CLASS}
          placeholder="Paste your configuration YAML here"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!input.trim()}
            className={`rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
          >
            Analyze Configuration
          </button>
          <button
            type="button"
            onClick={handleClear}
            className={`rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted ${FOCUS_RING}`}
          >
            Clear
          </button>
        </div>
      </div>

      {isStale && (
        <div className="border-b border-border bg-surface-muted p-4 text-sm text-muted-foreground">
          Input has changed. Click "Analyze Configuration" to refresh results.
        </div>
      )}

      {/* Results Section */}
      {displayResult && (
        <div className="p-4">
          {displayResult.validationErrors.length > 0 && (
            <div className="mb-4 rounded-md border border-destructive bg-destructive-muted px-3 py-2 text-sm">
              <p className="font-medium text-destructive">Validation Errors</p>
              <ul className="mt-1 list-disc pl-5">
                {displayResult.validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {displayResult.warnings.length > 0 && (
            <div className="mb-4 rounded-md border border-yellow-600 bg-yellow-50 px-3 py-2 text-sm">
              <p className="font-medium text-yellow-800">Warnings</p>
              <ul className="mt-1 list-disc pl-5">
                {displayResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {displayResult.ok && displayResult.findings.length === 0 && (
            <p className="text-sm text-muted-foreground">No findings to display.</p>
          )}

          {displayResult.findings.length > 0 && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">Findings</h2>
                <button
                  type="button"
                  onClick={handleExport}
                  className={`rounded-md border border-border bg-surface px-3 py-1 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted ${FOCUS_RING}`}
                >
                  Export JSON
                </button>
              </div>
              <div className="space-y-4">
                {displayResult.findings.map((finding) => (
                  <div key={finding.ruleId} className="rounded-md border border-border bg-surface p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-mono font-medium">PCI DSS {finding.requirement}</span>
                      <span className="text-muted-foreground">({finding.ruleId})</span>
                      <span className={`ml-auto rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[finding.status]}`}>
                        {STATUS_LABELS[finding.status]}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-foreground">{finding.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{finding.evidence}</p>
                    <p className="mt-1 text-xs text-muted-foreground italic">Remediation: {finding.remediation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer Notice */}
      <div className="border-t border-border p-4 text-xs text-muted-foreground">
        <p>
          This tool provides preliminary configuration gap-analysis. It does not
          assess PCI DSS compliance, does not prove that controls operate
          effectively, and does not replace a qualified security assessor.
        </p>
      </div>
    </div>
  );
}