import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

/**
 * Separate Vite configuration for the isolated development preview.
 *
 * This config is intentionally separate from `vite.config.ts` so that:
 *   - `reactRouter()` is NOT loaded — its `ssr:false` prerender loader
 *     validation does not run, so the preview server can start.
 *   - `react-router.config.ts` is NOT read or executed.
 *   - `src/app/routes.ts` is NOT imported.
 *   - The production route tree, loaders, and prerender configuration are
 *     completely bypassed.
 *
 * Tailwind CSS v4 is processed via `@tailwindcss/vite` so the preview looks
 * like the real site (same tokens, same utility classes).
 *
 * JSX/TSX transformation is handled by Vite's built-in esbuild, driven by
 * `tsconfig.json`'s `"jsx": "react-jsx"` setting. No additional React plugin
 * is required (the `react-jsx` automatic runtime is natively supported).
 *
 * Build output (if `vite build` were ever run with this config) is written
 * to `dev-preview-dist/` — entirely outside `build/client/` and `build/server/`,
 * so a production `react-router build` cannot pick it up.
 */
export default defineConfig({
  plugins: [tailwindcss()],
  root: "dev-preview",
  server: {
    port: 5174,
    strictPort: false,
  },
  build: {
    outDir: "../dev-preview-dist",
    emptyOutDir: true,
  },
});