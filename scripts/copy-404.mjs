import { readFile, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const SOURCE = resolve(ROOT, "build", "client", "404", "index.html");
const DEST = resolve(ROOT, "build", "client", "404.html");

async function main() {
  try {
    await access(SOURCE);
  } catch {
    console.error("Post-build 404 copy failed: build/client/404/index.html not found.");
    process.exit(1);
  }
  const html = await readFile(SOURCE, "utf8");
  await writeFile(DEST, html);
  console.log("Post-build 404 copy: build/client/404.html written.");
}

main().catch((err) => {
  console.error("Post-build 404 copy failed:", err.message);
  process.exit(1);
});