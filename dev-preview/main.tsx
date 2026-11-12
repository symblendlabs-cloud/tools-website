import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { SiteShell } from "../src/app/layouts/site-shell";
import JsonYamlConverter from "../src/tools/json-yaml-converter/index";
import "./preview.css";

/**
 * Development preview entry — NOT part of the production site.
 *
 * This file exists solely so the real JsonYamlConverter component can be
 * inspected inside the real SiteShell (header + footer + skip link) and with
 * the real global CSS applied — without invoking the React Router Framework
 * Vite plugin that would otherwise trigger its ssr:false prerender loader
 * validation (the current blocker for `npx react-router dev` and the
 * production build).
 *
 * This entry is served by `vite.dev-preview.config.ts`, which:
 *   - Includes `@tailwindcss/vite` (so Tailwind CSS is processed)
 *   - Does NOT include `reactRouter()` (so no framework validation runs)
 *   - Uses `dev-preview/` as its Vite root — completely isolated from `src/`
 *
 * `MemoryRouter` from the core `react-router` package provides the Location
 * and Navigation context required by `SiteHeader`'s `useLocation()` call and
 * by `SiteHeader`/`SiteFooter`'s `<Link>` components. Without this wrapper,
 * `SiteHeader` would throw "useLocation() may be used only in the context of
 * a <Router> component" at render.
 *
 * Navigation links inside the preview are intentionally non-functional
 * (there are no real routes in this MemoryRouter context). The preview is for
 * visual inspection of the tool UI only — clicking "Tools" or "Home" does
 * nothing. This is expected and acceptable for a preview.
 */

function Preview() {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <SiteShell>
        <main>
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
            <div
              role="status"
              className="mb-6 rounded-md border border-warning bg-warning-muted px-4 py-3 text-sm text-foreground"
            >
              <strong>Development preview</strong> — this page is not part of
              the production site. It renders the real JSON ↔ YAML Converter
              component inside the real site shell for visual review only.
            </div>

            <h1 className="mb-8 text-3xl font-semibold tracking-tight text-foreground">
              JSON ↔ YAML Converter — Preview
            </h1>

            <JsonYamlConverter />
          </div>
        </main>
      </SiteShell>
    </MemoryRouter>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Dev preview: #root element not found in dev-preview/index.html");
}
createRoot(rootElement).render(<Preview />);