// src/tools/iso27001-control-mapping-checker/index.tsx

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";

import {
  ANNEX_A_CONTROLS,
  CONTROL_BY_ID,
  STANDARD_META,
  THEMES,
  THEME_COUNTS,
  isKnownControlId,
} from "./annex-a-controls";
import {
  defaultApplicability,
  deriveControlState,
  setApplicability,
  validateApplicabilityDecision,
} from "./applicability";
import { computeCoverage } from "./coverage";
import { dedupeEdges, initialEdgesForPolicy } from "./mapper";
import { importFile, importXlsx } from "./importers";
import {
  MIME,
  buildMappingCsv,
  buildMappingXlsx,
  buildProjectJson,
  buildSoaCsv,
  buildSoaXlsx,
  downloadBlob,
} from "./exporters";
import { LIMITS } from "./schema";
import type {
  ApplicabilityDecision,
  ApplicabilityState,
  AssessmentData,
  ControlDefinition,
  DerivedControlState,
  ImplementationAssessment,
  ImplementationStatus,
  ImportDiagnostic,
  MappingEdge,
  PolicyRecord,
  Theme,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const BUTTON_PRIMARY = `rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

const BUTTON_SECONDARY = `rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

const INPUT_CLASS = `mt-1 w-full rounded-md border border-input-border bg-input px-3 py-2 text-sm text-foreground ${FOCUS_RING}`;

const APPLICABILITY_LABELS: Record<ApplicabilityState, string> = {
  not_assessed: "Not assessed",
  applicable: "Applicable",
  not_applicable: "Not applicable",
};

const IMPLEMENTATION_LABELS: Record<ImplementationStatus, string> = {
  not_assessed: "Not assessed",
  planned: "Planned",
  in_progress: "In progress",
  partially_implemented: "Partially implemented",
  implemented: "Implemented",
  not_implemented: "Not implemented",
};

const DERIVED_LABELS: Record<DerivedControlState, string> = {
  not_assessed: "Not assessed",
  excluded: "Excluded",
  covered: "Covered",
  suggested: "Suggested (unreviewed)",
  rejected_only: "Rejected only",
  unmapped: "Unmapped",
};

const REVIEW_LABELS: Record<MappingEdge["reviewStatus"], string> = {
  unreviewed: "Unreviewed",
  accepted: "Accepted",
  rejected: "Rejected",
  reassigned: "Reassigned",
};

const SOURCE_LABELS: Record<MappingEdge["source"], string> = {
  user_declared_ref: "Explicit reference",
  keyword_suggestion: "Keyword suggestion",
  manual_override: "Manual override",
};

const THEME_LABELS: Record<Theme, string> = {
  organizational: "Organizational",
  people: "People",
  physical: "Physical",
  technological: "Technological",
};

// ---------------------------------------------------------------------------
// Derived view types
// ---------------------------------------------------------------------------

type FilterApplicability = "all" | ApplicabilityState;
type FilterState = "all" | DerivedControlState;
type FilterTheme = "all" | Theme;

interface ControlRow {
  control: ControlDefinition;
  state: DerivedControlState;
  decision: ApplicabilityDecision;
  edges: MappingEdge[];
  acceptedPolicies: string[];
  suggestionCount: number;
  rejectedCount: number;
  implementation: ImplementationAssessment;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function matchesFilterText(text: string, needle: string): boolean {
  if (!needle) return true;
  return text.toLowerCase().includes(needle.toLowerCase());
}

function formulaWarningCount(diagnostics: ImportDiagnostic[]): number {
  return diagnostics.filter((d) => /formula/i.test(d.message)).length;
}

// ---------------------------------------------------------------------------
// Component — state, handlers, derived data. JSX body in part 2 of 2.
// ---------------------------------------------------------------------------

export default function Iso27001ControlMappingChecker() {
  // Import state
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [mappings, setMappings] = useState<MappingEdge[]>([]);
  const [applicability, setApplicabilityState] = useState<
    Record<string, ApplicabilityDecision>
  >(() => defaultApplicability());
  const [implementations, setImplementations] = useState<
    Record<string, ImplementationAssessment>
  >({});
  const [diagnostics, setDiagnostics] = useState<ImportDiagnostic[]>([]);
  const [uiError, setUiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const [lastFileSize, setLastFileSize] = useState<number | null>(null);
  const [pendingSheetChoices, setPendingSheetChoices] = useState<string[] | null>(null);
  const [pendingXlsxBytes, setPendingXlsxBytes] = useState<ArrayBuffer | null>(null);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTheme, setFilterTheme] = useState<FilterTheme>("all");
  const [filterApplicability, setFilterApplicability] = useState<FilterApplicability>("all");
  const [filterState, setFilterState] = useState<FilterState>("all");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [justificationDraft, setJustificationDraft] = useState<Record<string, string>>({});
  const [applicabilityDraft, setApplicabilityDraft] = useState<Record<string, ApplicabilityState>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  const fileLimitLabel = useMemo(
    () => `${formatBytes(LIMITS.maxFileBytes)} max, ${LIMITS.maxRecords} records max`,
    [],
  );

  // -------------------------------------------------------------------------
  // Import handlers
  // -------------------------------------------------------------------------

  const applyImported = useCallback(
    (newPolicies: PolicyRecord[], diags: ImportDiagnostic[], fileName: string, fileSize: number) => {
      setPolicies(newPolicies);
      setLastFileName(fileName);
      setLastFileSize(fileSize);
      setDiagnostics(diags);
      setUiError(null);

      const allNewEdges: MappingEdge[] = [];
      for (const p of newPolicies) {
        allNewEdges.push(...initialEdgesForPolicy(p));
      }
      setMappings(dedupeEdges(allNewEdges));
      // Applicability and implementations reset to defaults when a new file is loaded.
      setApplicabilityState(defaultApplicability());
      setImplementations({});
    },
    [],
  );

  const handleFileObject = useCallback(
    async (file: File) => {
      setUiError(null);
      setDiagnostics([]);
      setPendingSheetChoices(null);
      setPendingXlsxBytes(null);
      if (file.size === 0) {
        setUiError("The selected file is empty.");
        return;
      }
      if (file.size > LIMITS.maxFileBytes) {
        setUiError(
          `The selected file is ${formatBytes(file.size)}, which exceeds the ${formatBytes(LIMITS.maxFileBytes)} limit.`,
        );
        return;
      }
      const lower = file.name.toLowerCase();
      if (!/\.(csv|tsv|txt|xlsx|xls)$/.test(lower)) {
        setUiError(`Unsupported file type: ${file.name}`);
        return;
      }

      setLoading(true);
      try {
        if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
          const bytes = await file.arrayBuffer();
          const result = await importXlsx(bytes);
          if (!result.ok) {
            setUiError(result.error);
            if (result.diagnostics) setDiagnostics(result.diagnostics);
            return;
          }
          if (result.sheets && result.sheets.length > 1) {
            // Offer sheet selection before applying.
            setPendingXlsxBytes(bytes);
            setPendingSheetChoices(result.sheets.map((s) => s.name));
            return;
          }
          applyImported(result.policies, result.diagnostics, file.name, file.size);
        } else {
          const result = await importFile(file);
          if (!result.ok) {
            setUiError(result.error);
            if (result.diagnostics) setDiagnostics(result.diagnostics);
            return;
          }
          applyImported(result.policies, result.diagnostics, file.name, file.size);
        }
      } catch (err) {
        setUiError(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    },
    [applyImported],
  );

  const handleSheetChoose = useCallback(
    async (sheetName: string) => {
      if (!pendingXlsxBytes) return;
      setLoading(true);
      try {
        const result = await importXlsx(pendingXlsxBytes, { sheetName });
        if (!result.ok) {
          setUiError(result.error);
          return;
        }
        const fileName = lastFileName ?? "workbook.xlsx";
        const fileSize = lastFileSize ?? pendingXlsxBytes.byteLength;
        setPendingSheetChoices(null);
        setPendingXlsxBytes(null);
        applyImported(result.policies, result.diagnostics, fileName, fileSize);
      } finally {
        setLoading(false);
      }
    },
    [pendingXlsxBytes, lastFileName, lastFileSize, applyImported],
  );

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFileObject(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFileObject(file);
    },
    [handleFileObject],
  );
  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(true);
  }
  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
  }

  // -------------------------------------------------------------------------
  // Mapping review handlers
  // -------------------------------------------------------------------------

  const updateEdge = useCallback(
    (edge: MappingEdge, patch: Partial<MappingEdge>) => {
      setMappings((prev) => {
        const idx = prev.findIndex(
          (e) => e.policyId === edge.policyId && e.controlId === edge.controlId && e.source === edge.source,
        );
        if (idx < 0) return prev;
        const existing = prev[idx];
        if (!existing) return prev;
        const next = prev.slice();
        next[idx] = { ...existing, ...patch };
        return next;
      });
    },
    [],
  );

  const removeEdge = useCallback((edge: MappingEdge) => {
    setMappings((prev) =>
      prev.filter(
        (e) => !(e.policyId === edge.policyId && e.controlId === edge.controlId && e.source === edge.source),
      ),
    );
  }, []);

  const acceptEdge = useCallback(
    (edge: MappingEdge) => updateEdge(edge, { reviewStatus: "accepted" }),
    [updateEdge],
  );
  const rejectEdge = useCallback(
    (edge: MappingEdge) => updateEdge(edge, { reviewStatus: "rejected" }),
    [updateEdge],
  );
  const reassignEdge = useCallback(
    (edge: MappingEdge, newControlId: string) => {
      if (!isKnownControlId(newControlId)) return;
      setMappings((prev) => {
        const idx = prev.findIndex(
          (e) => e.policyId === edge.policyId && e.controlId === edge.controlId && e.source === edge.source,
        );
        if (idx < 0) return prev;
        const existing = prev[idx];
        if (!existing) return prev;
        const next = prev.slice();
        next[idx] = {
          ...existing,
          controlId: newControlId,
          reviewStatus: "reassigned",
          source: "manual_override",
          matchReason: "Manually reassigned by reviewer",
        };
        return dedupeEdges(next);
      });
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Applicability + implementation handlers
  // -------------------------------------------------------------------------

  const commitApplicability = useCallback(
    (controlId: string) => {
      const draftState = applicabilityDraft[controlId] ?? applicability[controlId]?.state ?? "not_assessed";
      const draftJustification = justificationDraft[controlId] ?? applicability[controlId]?.justification ?? "";
      const { next, validation } = setApplicability(applicability, controlId, draftState, draftJustification);
      if (!validation.ok) {
        setUiError(validation.errors[0] ?? "Invalid applicability change.");
        return;
      }
      setApplicabilityState(next);
      setJustificationDraft((prev) => ({ ...prev, [controlId]: "" }));
      setApplicabilityDraft((prev) => {
        const copy = { ...prev };
        delete copy[controlId];
        return copy;
      });
      setUiError(null);
    },
    [applicability, applicabilityDraft, justificationDraft],
  );

  const updateImplementation = useCallback(
    (controlId: string, status: ImplementationStatus, evidenceRefs?: string) => {
      setImplementations((prev) => ({
        ...prev,
        [controlId]: { controlId, status, evidenceRefs },
      }));
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const coverage = useMemo(() => computeCoverage(applicability, mappings), [applicability, mappings]);

  const controlRows: ControlRow[] = useMemo(() => {
    const edgesByControl = new Map<string, MappingEdge[]>();
    for (const e of mappings) {
      const list = edgesByControl.get(e.controlId) ?? [];
      list.push(e);
      edgesByControl.set(e.controlId, list);
    }
    return ANNEX_A_CONTROLS.map((control) => {
      const edges = edgesByControl.get(control.id) ?? [];
      const acceptedPolicies = edges
        .filter((e) => e.reviewStatus === "accepted")
        .map((e) => e.policyId);
      const suggestionCount = edges.filter(
        (e) => e.reviewStatus === "unreviewed" && e.source === "keyword_suggestion",
      ).length;
      const rejectedCount = edges.filter((e) => e.reviewStatus === "rejected").length;
      return {
        control,
        state: deriveControlState(control.id, applicability, edges),
        decision: applicability[control.id] ?? { controlId: control.id, state: "not_assessed" },
        edges,
        acceptedPolicies,
        suggestionCount,
        rejectedCount,
        implementation: implementations[control.id] ?? { controlId: control.id, status: "not_assessed" },
      };
    });
  }, [applicability, mappings, implementations]);

  const filteredControls = useMemo(() => {
    return controlRows.filter((row) => {
      if (filterTheme !== "all" && row.control.theme !== filterTheme) return false;
      if (filterApplicability !== "all" && row.decision.state !== filterApplicability) return false;
      if (filterState !== "all" && row.state !== filterState) return false;
      const haystack = `${row.control.id} ${row.control.label}`;
      return matchesFilterText(haystack, searchQuery);
    });
  }, [controlRows, filterTheme, filterApplicability, filterState, searchQuery]);

  const pendingSuggestions = useMemo(
    () =>
      mappings
        .filter((e) => e.reviewStatus === "unreviewed" && e.source === "keyword_suggestion")
        .map((e) => ({
          edge: e,
          control: CONTROL_BY_ID.get(e.controlId),
          policy: policies.find((p) => p.policyId === e.policyId),
        })),
    [mappings, policies],
  );

  // -------------------------------------------------------------------------
  // Export handlers
  // -------------------------------------------------------------------------

  const assessmentData: AssessmentData = useMemo(
    () => ({ policies, applicability, mappings, implementations }),
    [policies, applicability, mappings, implementations],
  );

  function handleExportProjectJson() {
    const json = buildProjectJson(assessmentData);
    downloadBlob(json, MIME.json, "iso27001-project.json");
  }
  function handleExportMappingCsv() {
    downloadBlob(buildMappingCsv(assessmentData), MIME.csv, "iso27001-mappings.csv");
  }
  async function handleExportMappingXlsx() {
    const bytes = await buildMappingXlsx(assessmentData);
    downloadBlob(bytes.buffer as ArrayBuffer, MIME.xlsx, "iso27001-mappings.xlsx");
  }
  function handleExportSoaCsv() {
    downloadBlob(buildSoaCsv(assessmentData), MIME.csv, "iso27001-soa.csv");
  }
  async function handleExportSoaXlsx() {
    const bytes = await buildSoaXlsx(assessmentData);
    downloadBlob(bytes.buffer as ArrayBuffer, MIME.xlsx, "iso27001-soa.xlsx");
  }

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  function resetAll() {
    setPolicies([]);
    setMappings([]);
    setApplicabilityState(defaultApplicability());
    setImplementations({});
    setDiagnostics([]);
    setUiError(null);
    setLastFileName(null);
    setLastFileSize(null);
    setPendingSheetChoices(null);
    setPendingXlsxBytes(null);
    setSearchQuery("");
    setFilterTheme("all");
    setFilterApplicability("all");
    setFilterState("all");
    setJustificationDraft({});
    setApplicabilityDraft({});
    setShowResetConfirm(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const hasData = policies.length > 0 || mappings.length > 0;
  const liveMessage = loading
    ? "Parsing file…"
    : uiError
      ? "Error encountered."
      : hasData
        ? "Assessment ready."
        : "";

  // -------------------------------------------------------------------------
  // JSX body
  // -------------------------------------------------------------------------

  return (
    <div className="rounded-lg border border-border bg-surface" aria-busy={loading}>
      <p role="status" aria-live="polite" className="sr-only">{liveMessage}</p>

      {/* --------------------------------------------------------------- */}
      {/* Security notice                                                  */}
      {/* --------------------------------------------------------------- */}
      <div className="border-b border-border bg-yellow-50 p-4">
        <p className="text-sm font-medium text-yellow-800">
          This tool processes security policy data entirely in your browser. Nothing is uploaded, stored, or sent to any server.
          Do not paste secrets, credentials, or information you are not authorized to handle. Mapping coverage is an assessment aid,
          not a compliance certification.
        </p>
      </div>

      {/* --------------------------------------------------------------- */}
      {/* Import area                                                      */}
      {/* --------------------------------------------------------------- */}
      <section className="border-b border-border p-4" aria-labelledby="import-heading">
        <h2 id="import-heading" className="text-base font-semibold text-foreground">
          Import policies
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload a CSV or XLSX file. Required columns: policy name and policy description. Optional columns: policy id,
          owner, category, status, scope, evidence references. Limits: {fileLimitLabel}, {LIMITS.maxColumns} columns,
          {LIMITS.maxCellLength} characters per cell, {LIMITS.maxWorksheets} worksheets.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={fileInputId} className="block text-sm font-medium text-foreground">
              Select a policy file
            </label>
            <input
              id={fileInputId}
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls"
              onChange={handleFileInputChange}
              className={`mt-1 block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary-hover ${FOCUS_RING}`}
            />
          </div>
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDragEnter={onDragOver}
            aria-label="Drop a CSV or XLSX file here"
            className={
              "flex flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-4 text-center transition-colors " +
              (dragActive ? "border-primary bg-surface-muted" : "border-border bg-surface-muted")
            }
          >
            <p className="text-sm text-foreground">Drop a CSV or XLSX file here</p>
            <p className="mt-1 text-xs text-muted-foreground">or use the picker</p>
          </div>
        </div>

        {lastFileName ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Loaded: <span className="font-mono">{lastFileName}</span>
            {lastFileSize !== null ? ` (${formatBytes(lastFileSize)})` : ""} — {policies.length} policy record(s).
          </p>
        ) : null}

        {pendingSheetChoices ? (
          <div className="mt-3 rounded-md border border-yellow-600 bg-yellow-50 px-3 py-2 text-sm">
            <p className="font-medium text-yellow-800">Select a worksheet</p>
            <p className="mt-1 text-xs text-yellow-800">
              This workbook contains multiple worksheets. Choose the one that holds the policy records.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {pendingSheetChoices.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => void handleSheetChoose(name)}
                  className={BUTTON_SECONDARY}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {uiError ? (
          <div
            role="alert"
            aria-live="assertive"
            className="mt-3 rounded-md border border-destructive bg-destructive-muted px-3 py-2 text-sm text-foreground"
          >
            {uiError}
          </div>
        ) : null}

        {diagnostics.length > 0 ? (
          <div className="mt-3 rounded-md border border-yellow-600 bg-yellow-50 px-3 py-2 text-sm">
            <button
              type="button"
              onClick={() => setShowDiagnostics((v) => !v)}
              className={`text-left font-medium text-yellow-800 ${FOCUS_RING}`}
              aria-expanded={showDiagnostics}
            >
              {showDiagnostics ? "Hide" : "Show"} {diagnostics.length} import diagnostic(s)
              {formulaWarningCount(diagnostics) > 0
                ? ` — ${formulaWarningCount(diagnostics)} related to formula cells`
                : ""}
            </button>
            {showDiagnostics ? (
              <ul className="mt-2 max-h-64 overflow-y-auto list-disc pl-5 text-xs text-yellow-800">
                {diagnostics.map((d, i) => (
                  <li key={i}>
                    {d.row > 0 ? `Row ${d.row}` : "File"}
                    {d.column ? `, column ${d.column}` : ""}: {d.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <p aria-live="polite" className="mt-3 text-sm text-muted-foreground">
            Parsing file…
          </p>
        ) : null}
      </section>

      {/* --------------------------------------------------------------- */}
      {/* Overview                                                         */}
      {/* --------------------------------------------------------------- */}
      <section className="border-b border-border p-4" aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="text-base font-semibold text-foreground">
          Mapping overview
        </h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <dt className="text-muted-foreground">Total controls</dt>
          <dd className="font-mono">{coverage.counts.total}</dd>
          <dt className="text-muted-foreground">Applicable</dt>
          <dd className="font-mono">{coverage.counts.applicable}</dd>
          <dt className="text-muted-foreground">Not applicable</dt>
          <dd className="font-mono">{coverage.counts.notApplicable}</dd>
          <dt className="text-muted-foreground">Not assessed</dt>
          <dd className="font-mono">{coverage.counts.notAssessed}</dd>
          <dt className="text-muted-foreground">Covered</dt>
          <dd className="font-mono">{coverage.counts.applicableWithAccepted}</dd>
          <dt className="text-muted-foreground">Uncovered</dt>
          <dd className="font-mono">{coverage.counts.applicableWithoutAccepted}</dd>
          <dt className="text-muted-foreground">Pending suggestions</dt>
          <dd className="font-mono">{coverage.counts.suggestionsAwaitingReview}</dd>
          <dt className="text-muted-foreground">Rejected</dt>
          <dd className="font-mono">{coverage.counts.rejectedMappings}</dd>
        </dl>
        <p className="mt-3 text-sm text-foreground">
          <strong>Mapping coverage:</strong>{" "}
          {coverage.percent === null ? (
            <span>N/A — no controls have been marked applicable yet.</span>
          ) : (
            <span className="font-mono">{coverage.percent.toFixed(1)}%</span>
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Coverage = applicable controls with at least one accepted mapping ÷ applicable controls × 100. Suggested and rejected mappings do not count.
          This measures mapping coverage only — not compliance, certification readiness, or control effectiveness.
        </p>

        <div className="mt-3 overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Theme</th>
                <th className="px-3 py-2">Applicable</th>
                <th className="px-3 py-2">Covered</th>
                <th className="px-3 py-2">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {THEMES.map((theme) => {
                const row = coverage.byTheme[theme];
                return (
                  <tr key={theme} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground">{THEME_LABELS[theme]}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.applicable}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.withAccepted}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.percent === null ? "N/A" : `${row.percent.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* --------------------------------------------------------------- */}
      {/* Mapping review queue                                             */}
      {/* --------------------------------------------------------------- */}
      <section className="border-b border-border p-4" aria-labelledby="review-heading">
        <h2 id="review-heading" className="text-base font-semibold text-foreground">
          Mapping review queue ({pendingSuggestions.length})
        </h2>
        {pendingSuggestions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No unreviewed suggestions. Import a file or review suggestions that appear here.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {pendingSuggestions.slice(0, 50).map(({ edge, control, policy }) => (
              <li key={`${edge.policyId}::${edge.controlId}::${edge.source}`} className="rounded-md border border-border bg-surface-muted p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono font-medium">{edge.controlId}</span>
                  <span className="text-muted-foreground">{control?.label ?? ""}</span>
                  <span className="ml-auto rounded px-2 py-0.5 text-xs font-medium border border-yellow-600 bg-yellow-50 text-yellow-800">
                    {REVIEW_LABELS[edge.reviewStatus]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Policy: <span className="font-mono">{edge.policyId}</span>
                  {policy ? ` — ${policy.policyName}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground italic">
                  Reason: {edge.matchReason}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => acceptEdge(edge)} className={BUTTON_PRIMARY}>
                    Accept
                  </button>
                  <button type="button" onClick={() => rejectEdge(edge)} className={BUTTON_SECONDARY}>
                    Reject
                  </button>
                  <label className="ml-2 text-xs text-muted-foreground">
                    Reassign to{" "}
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value) reassignEdge(edge, value);
                      }}
                      className={`mt-1 rounded-md border border-input-border bg-input px-2 py-1 text-xs text-foreground ${FOCUS_RING}`}
                    >
                      <option value="">— choose control —</option>
                      {ANNEX_A_CONTROLS.map((c) => (
                        <option key={c.id} value={c.id}>
                        {c.id} — {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={() => removeEdge(edge)} className={`ml-auto ${BUTTON_SECONDARY}`}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
            {pendingSuggestions.length > 50 ? (
              <li className="text-xs text-muted-foreground">
                Showing first 50 of {pendingSuggestions.length} suggestions. Accept, reject, or filter to reduce the queue.
              </li>
            ) : null}
          </ul>
        )}
      </section>

      {/* --------------------------------------------------------------- */}
      {/* Exports                                                          */}
      {/* --------------------------------------------------------------- */}
      <section className="border-b border-border p-4" aria-labelledby="exports-heading">
        <h2 id="exports-heading" className="text-base font-semibold text-foreground">
          Exports
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The Statement of Applicability always contains all 93 controls, including not-assessed and not-applicable controls, and is a draft
          artifact requiring organizational review.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={handleExportProjectJson} disabled={!hasData} className={BUTTON_SECONDARY}>
            Project JSON
          </button>
          <button type="button" onClick={handleExportMappingCsv} disabled={mappings.length === 0} className={BUTTON_SECONDARY}>
            Mapping CSV
          </button>
          <button type="button" onClick={() => void handleExportMappingXlsx()} disabled={mappings.length === 0} className={BUTTON_SECONDARY}>
            Mapping XLSX
          </button>
          <button type="button" onClick={handleExportSoaCsv} disabled={!hasData} className={BUTTON_SECONDARY}>
            SoA CSV
          </button>
          <button type="button" onClick={() => void handleExportSoaXlsx()} disabled={!hasData} className={BUTTON_SECONDARY}>
            SoA XLSX
          </button>
        </div>
      </section>

      {/* --------------------------------------------------------------- */}
      {/* Reset                                                            */}
      {/* --------------------------------------------------------------- */}
      <section className="border-b border-border p-4" aria-labelledby="reset-heading">
        <h2 id="reset-heading" className="text-base font-semibold text-foreground">
          Reset
        </h2>
        {showResetConfirm ? (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-confirm-heading"
            className="mt-2 rounded-md border border-destructive bg-destructive-muted px-3 py-2 text-sm"
          >
            <p id="reset-confirm-heading" className="font-medium text-destructive">
              Clear all imported policies, mappings, applicability and implementation assessments?
            </p>
            <p className="mt-1 text-xs text-destructive">This cannot be undone. Export first if you need to keep anything.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={resetAll} className={BUTTON_PRIMARY}>
                Yes, clear everything
              </button>
              <button type="button" onClick={() => setShowResetConfirm(false)} className={BUTTON_SECONDARY}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => setShowResetConfirm(true)} disabled={!hasData} className={BUTTON_SECONDARY}>
              Clear all data
            </button>
            <p className="text-xs text-muted-foreground">
              Exports remain on your computer; this only clears the in-memory assessment in this browser tab.
            </p>
          </div>
        )}
      </section>

      {/* --------------------------------------------------------------- */}
      {/* Controls workspace                                               */}
      {/* --------------------------------------------------------------- */}
      <section className="border-b border-border p-4" aria-labelledby="controls-heading">
        <h2 id="controls-heading" className="text-base font-semibold text-foreground">
          Control workspace
        </h2>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
          <label className="text-xs text-muted-foreground">
            Search
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Control ID or label"
              className={INPUT_CLASS}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Theme
            <select value={filterTheme} onChange={(e) => setFilterTheme(e.target.value as FilterTheme)} className={INPUT_CLASS}>
              <option value="all">All themes</option>
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {THEME_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Applicability
            <select
              value={filterApplicability}
              onChange={(e) => setFilterApplicability(e.target.value as FilterApplicability)}
              className={INPUT_CLASS}
            >
              <option value="all">All</option>
              <option value="applicable">Applicable</option>
              <option value="not_applicable">Not applicable</option>
              <option value="not_assessed">Not assessed</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Mapping state
            <select value={filterState} onChange={(e) => setFilterState(e.target.value as FilterState)} className={INPUT_CLASS}>
              <option value="all">All</option>
              {(Object.keys(DERIVED_LABELS) as DerivedControlState[]).map((s) => (
                <option key={s} value={s}>
                  {DERIVED_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {filteredControls.length} of {ANNEX_A_CONTROLS.length} controls shown.
        </p>

        <div className="mt-3 overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2">ID</th>
                <th className="px-2 py-2">Theme</th>
                <th className="px-2 py-2">Label</th>
                <th className="px-2 py-2">Applicability</th>
                <th className="px-2 py-2">State</th>
                <th className="px-2 py-2">Mappings</th>
                <th className="px-2 py-2">Implementation</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredControls.map((row) => (
                <tr key={row.control.id} className="border-t border-border align-top">
                  <td className="px-2 py-2 font-mono text-xs">{row.control.id}</td>
                  <td className="px-2 py-2 text-xs">{THEME_LABELS[row.control.theme]}</td>
                  <td className="px-2 py-2 text-xs">{row.control.label}</td>
                  <td className="px-2 py-2 text-xs">
                    {APPLICABILITY_LABELS[row.decision.state]}
                    {row.decision.state === "not_applicable" && row.decision.justification ? (
                      <p className="mt-1 text-muted-foreground italic">{row.decision.justification}</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <span
                      className={
                        "rounded px-2 py-0.5 " +
                        (row.state === "covered"
                          ? "border border-green-600 bg-green-50 text-green-800"
                          : row.state === "suggested"
                            ? "border border-yellow-600 bg-yellow-50 text-yellow-800"
                            : row.state === "excluded"
                              ? "border border-gray-400 bg-gray-100 text-gray-700"
                              : row.state === "rejected_only"
                                ? "border border-destructive bg-destructive-muted text-destructive"
                                : "border border-border bg-surface-muted text-muted-foreground")
                      }
                    >
                      {DERIVED_LABELS[row.state]}
                    </span>
                    <p className="mt-1 text-muted-foreground">
                      {row.acceptedPolicies.length} accepted, {row.suggestionCount} pending, {row.rejectedCount} rejected
                    </p>
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {row.acceptedPolicies.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <ul className="list-disc pl-4">
                        {row.acceptedPolicies.map((pid) => (
                          <li key={pid} className="font-mono">{pid}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <select
                      value={row.implementation.status}
                      onChange={(e) => updateImplementation(row.control.id, e.target.value as ImplementationStatus, row.implementation.evidenceRefs)}
                      aria-label={`Implementation for ${row.control.id}`}
                      className={`w-full rounded-md border border-input-border bg-input px-2 py-1 text-xs text-foreground ${FOCUS_RING}`}
                    >
                      {(Object.keys(IMPLEMENTATION_LABELS) as ImplementationStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {IMPLEMENTATION_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <div className="flex flex-col gap-1">
                      <select
                        value={applicabilityDraft[row.control.id] ?? row.decision.state}
                        onChange={(e) =>
                          setApplicabilityDraft((prev) => ({ ...prev, [row.control.id]: e.target.value as ApplicabilityState }))
                        }
                        className={`rounded-md border border-input-border bg-input px-2 py-1 text-xs text-foreground ${FOCUS_RING}`}
                        aria-label={`Applicability for ${row.control.id}`}
                      >
                        {(Object.keys(APPLICABILITY_LABELS) as ApplicabilityState[]).map((s) => (
                          <option key={s} value={s}>
                            {APPLICABILITY_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      {(applicabilityDraft[row.control.id] ?? row.decision.state) === "not_applicable" ? (
                        <input
                          type="text"
                          value={justificationDraft[row.control.id] ?? row.decision.justification ?? ""}
                          onChange={(e) =>
                            setJustificationDraft((prev) => ({ ...prev, [row.control.id]: e.target.value }))
                          }
                          placeholder="Justification required"
                          className={`rounded-md border border-input-border bg-input px-2 py-1 text-xs text-foreground ${FOCUS_RING}`}
                          aria-label={`Justification for ${row.control.id}`}
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => commitApplicability(row.control.id)}
                        className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-muted"
                      >
                        Save applicability
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* --------------------------------------------------------------- */}
      {/* Footer disclaimer                                                */}
      {/* --------------------------------------------------------------- */}
      <div className="p-4 text-xs text-muted-foreground">
        <p>
          This tool is an assessment and mapping aid. It does not establish compliance, verify control implementation, determine evidence sufficiency,
          or replace qualified internal or external audit and certification processes. All parsing, mapping, and export logic runs in your browser;
          nothing is uploaded, stored, or transmitted.
        </p>
      </div>
    </div>
  );
}
