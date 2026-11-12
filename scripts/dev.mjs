import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const contentRepo =
  process.env.TOOLS_CONTENT_PATH ?? resolve(repoRoot, "..", "tools-content");

// Spawn the local react-router binary directly instead of going through npx.
// On Windows, npm installs create a react-router.cmd shim. Node refuses to
// execute .cmd files without a shell, so we route through cmd.exe explicitly.
// This avoids both EINVAL and the DEP0190 shell-args warning.
const isWin = process.platform === "win32";

const command = isWin ? "react-router.cmd" : "react-router";
const args = ["dev"];

const child = isWin
  ? spawn("cmd.exe", ["/d", "/s", "/c", `${command} ${args.join(" ")}`], {
      stdio: "inherit",
      env: { ...process.env, TOOLS_CONTENT_PATH: contentRepo },
      windowsVerbatimArguments: true,
    })
  : spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, TOOLS_CONTENT_PATH: contentRepo },
    });

child.on("error", (err) => {
  console.error(
    "[dev] Failed to start the development server.\n" +
      `  Command: ${command} ${args.join(" ")}\n` +
      `  CWD:     ${repoRoot}\n` +
      `  Content: ${contentRepo}\n` +
      `  Reason:  ${err.message}\n` +
      "  Hint:    run `npm install` and confirm node_modules/.bin/react-router.cmd exists.",
  );
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});