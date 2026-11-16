import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { validateOrigin } from "./generate-sitemap.mjs";

const ROOT = process.cwd();

/**
 * Run a subprocess with argument-array semantics and inherited stdio.
 * No shell. Node passes the array directly to the OS at spawn time.
 */
async function run(command, args, env = process.env, cwd = ROOT) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
      cwd,
    });

    child.on("error", (err) => rejectPromise(err));
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else
        rejectPromise(
          new Error(
            `Command failed with exit code ${code}: ${command} ${args.join(" ")}`,
          ),
        );
    });
  });
}

/**
 * Resolve the React Router CLI entry point by reading the installed
 * package manifest. The `bin` field can be a string (single command)
 * or an object (command name → script path). This avoids hardcoding
 * bin.js vs bin.cjs and survives minor version bumps.
 */
async function resolveReactRouterCli() {
  const pkgPath = resolve(ROOT, "node_modules", "@react-router", "dev", "package.json");
  let pkg;
  try {
    pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  } catch {
    throw new Error(
      `Unable to locate @react-router/dev. Run "npm install" and retry (expected at ${pkgPath}).`,
    );
  }
  const bin = pkg.bin;
  let relative;
  if (typeof bin === "string") {
    relative = bin;
  } else if (bin && typeof bin === "object") {
    // Prefer the "react-router" command name; fall back to "react-router-dev".
    relative =
      bin["react-router"] ??
      bin["react-router-dev"] ??
      Object.values(bin)[0];
  }
  if (typeof relative !== "string" || relative.length === 0) {
    throw new Error(
      `@react-router/dev has no bin entry in its package.json. Cannot resolve CLI.`,
    );
  }
  return resolve(ROOT, "node_modules", "@react-router", "dev", relative);
}

async function main() {
  let tempDir = null;
  let contentPath = process.env.TOOLS_CONTENT_PATH;

  try {
    // 1. Validate SITE_ORIGIN
    const originValidation = validateOrigin(process.env.SITE_ORIGIN);
    if (!originValidation.ok) {
      console.error(`Build failed: ${originValidation.error}`);
      console.error(
        "Please set a valid SITE_ORIGIN (e.g., https://example.com).",
      );
      process.exit(1);
    }
    const siteOrigin = originValidation.origin;
    console.log(`Building for origin: ${siteOrigin}`);

    // 2. Resolve content repository
    if (!contentPath) {
      const token = process.env.TOOLS_CONTENT_REPO_TOKEN;
      if (!token) {
        console.error(
          "Build failed: TOOLS_CONTENT_PATH is not set, and TOOLS_CONTENT_REPO_TOKEN is unavailable for cloning.",
        );
        process.exit(1);
      }

      console.log("TOOLS_CONTENT_PATH not set. Cloning content repository...");
      tempDir = await mkdtemp(join(tmpdir(), "chifral-content-"));

      const repoUrl =
        "https://github.com/symblendlabs-cloud/tools-content.git";
      const authHeader = Buffer.from(`x-access-token:${token}`).toString(
        "base64",
      );

      // Token is passed to Git via environment-based HTTP header config.
      // It never appears in args, the URL, stdout, or stderr.
      const gitEnv = {
        ...process.env,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "http.extraHeader",
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${authHeader}`,
      };

      const gitCommand = process.platform === "win32" ? "git.exe" : "git";
      await run(
        gitCommand,
        ["clone", "--depth", "1", "--branch", "main", repoUrl, tempDir],
        gitEnv,
      );
      contentPath = tempDir;
      console.log("Content repository cloned successfully.");
    } else {
      if (!isAbsolute(contentPath)) {
        console.error(
          "Build failed: TOOLS_CONTENT_PATH must be an absolute path. Relative paths are not supported.",
        );
        process.exit(1);
      }
      contentPath = resolve(contentPath);
      console.log(`Using existing TOOLS_CONTENT_PATH: ${contentPath}`);
    }

    // 3. Propagate environment to child processes
    const buildEnv = {
      ...process.env,
      TOOLS_CONTENT_PATH: contentPath,
      SITE_ORIGIN: siteOrigin,
    };

    // 4. React Router production build — invoke CLI directly under Node
    const reactRouterCli = await resolveReactRouterCli();
    console.log("\nStarting React Router production build...");
    await run(process.execPath, [reactRouterCli, "build"], buildEnv);

    // 5. Copy 404
    console.log("\nCopying 404.html...");
    await run(process.execPath, ["scripts/copy-404.mjs"], buildEnv);

    // 6. Generate sitemap and robots.txt for all deployments.
    console.log("\nGenerating sitemap...");
    await run(process.execPath, ["scripts/generate-sitemap.mjs"], buildEnv);

    // 7. Run scanner
    console.log("\nRunning client build scan...");
    await run(process.execPath, ["scripts/scan-build.mjs"], buildEnv);

    console.log("\nProduction build completed successfully.");
  } catch (err) {
    console.error(`\nBuild failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    if (tempDir) {
      console.log("Cleaning up temporary content checkout...");
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error("Unexpected build failure:", err);
  process.exit(1);
});