import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { runAnalyzer } from "../cli.mjs";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const CLI_PATH = resolve(REPO_ROOT, "geo", "analyzer", "cli.mjs");
const TSX_CLI = resolve(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const BUILD_DIR = resolve(REPO_ROOT, "build", "client");

async function runTsxCli(env, extraArgs = []) {
  return execFileAsync(
    process.execPath,
    [TSX_CLI, CLI_PATH, ...extraArgs],
    {
      cwd: REPO_ROOT,
      env,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
}

describe("runAnalyzer — source mode", () => {
  let report;
  let hasContent;

  beforeAll(async () => {
    hasContent = Boolean(process.env.TOOLS_CONTENT_PATH);
    if (hasContent) {
      report = await runAnalyzer({
        mode: "source",
        origin: "https://chifral.pages.dev",
      });
    }
  });

  it("rejects an unsupported mode", async () => {
    await expect(runAnalyzer({ mode: "invalid" })).rejects.toThrow(/unsupported mode/);
  });

  it("rejects a non-HTTPS origin", async () => {
    await expect(runAnalyzer({ mode: "source", origin: "http://example.com" })).rejects.toThrow(/HTTPS/);
  });

  it("produces a report with the expected top-level shape", () => {
    if (!hasContent) return;
    expect(report).toHaveProperty("mode", "source");
    expect(Array.isArray(report.pages)).toBe(true);
    expect(report.pages.length).toBeGreaterThan(0);
    expect(report).toHaveProperty("summary");
  });
});

describe("cli.mjs — source mode via tsx", () => {
  it("emits valid JSON against real content", { timeout: 20000 }, async () => {
    if (!process.env.TOOLS_CONTENT_PATH) return;
    const { stdout } = await runTsxCli({ ...process.env }, ["--mode=source"]);
    const report = JSON.parse(stdout);
    expect(report.mode).toBe("source");
    expect(report.pages.length).toBeGreaterThan(0);
  });

  it("fails clearly when TOOLS_CONTENT_PATH is unset", { timeout: 20000 }, async () => {
    const env = { ...process.env };
    delete env.TOOLS_CONTENT_PATH;
    let caught = null;
    try {
      await runTsxCli(env, ["--mode=source"]);
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeNull();
    expect(caught.code).not.toBe(0);
    expect(String(caught.stderr ?? "")).toMatch(/failed to load public content|TOOLS_CONTENT_PATH environment variable is not set/i);
  });
});

describe("cli.mjs — build mode via tsx", () => {
  it("emits valid JSON when build/client/ exists", { timeout: 20000 }, async () => {
    if (!existsSync(BUILD_DIR)) return;
    const { stdout } = await runTsxCli({ ...process.env }, ["--mode=build"]);
    const report = JSON.parse(stdout);
    expect(report.mode).toBe("build");
    expect(Array.isArray(report.pages)).toBe(true);
    expect(report.pages.length).toBeGreaterThan(0);
    expect(Array.isArray(report.siteChecks)).toBe(true);
    expect(report.siteChecks.length).toBeGreaterThan(0);
  });

  it("fails clearly when build/client/ does not exist", async () => {
    let caught = null;
    try {
      await runTsxCli({ ...process.env }, ["--mode=build", `--build-dir=${resolve(REPO_ROOT, "nonexistent-build")}`]);
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeNull();
    expect(caught.code).not.toBe(0);
    expect(String(caught.stderr ?? "")).toMatch(/does not exist|no HTML files/i);
  });
});