import {
  readFile,
  writeFile,
  access,
  readdir,
  cp,
} from "node:fs/promises";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const CLIENT = resolve(ROOT, "build", "client");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const rawBasePath = process.env.VITE_BASE_PATH || "/";
  const basePath = rawBasePath.replace(/^\/+|\/+$/g, "");
  const deployDir = basePath
    ? resolve(CLIENT, basePath)
    : CLIENT;

  if (basePath) {
    await access(deployDir);

    // Copy shared Vite assets into the GitHub Pages publish directory.
    const assets = resolve(CLIENT, "assets");
    if (await exists(assets)) {
      await cp(assets, join(deployDir, "assets"), {
        recursive: true,
        force: true,
      });
    }

    // Copy public files (favicons, manifest, ads.txt, verification files).
    for (const entry of await readdir(CLIENT, { withFileTypes: true })) {
      if (entry.isFile() && entry.name !== "index.html") {
        await cp(
          join(CLIENT, entry.name),
          join(deployDir, entry.name),
          { force: true },
        );
      }
    }
  }

  // GitHub Pages requires a top-level 404.html in its published directory.
  const source = resolve(deployDir, "404", "index.html");
  const destination = resolve(deployDir, "404.html");

  await access(source);
  await writeFile(destination, await readFile(source));

  console.log(`Deployment folder prepared: ${deployDir}`);
  console.log(`404 page written: ${destination}`);
}

main().catch((error) => {
  console.error("Deployment preparation failed:", error.message);
  process.exit(1);
});
