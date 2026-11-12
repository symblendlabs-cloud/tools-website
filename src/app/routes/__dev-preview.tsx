import { Container } from "../../ui/container";
import JsonYamlConverter from "../../tools/json-yaml-converter/index";

/**
 * DEVELOPMENT-ONLY PREVIEW ROUTE
 *
 * Renders the real JsonYamlConverter component outside the registry-driven
 * `/tools/:slug` route, so the tool UI can be visually reviewed in a browser
 * without promoting the tool to `ready`/`public` in the registry.
 *
 * SAFETY:
 * - This route is registered in `src/app/routes.ts` ONLY when
 *   `process.env.NODE_ENV !== "production"`.
 * - Therefore it is never included in the production route manifest and
 *   never bundled into `build/client/`.
 * - It does not import from `private/`, does not call `getSiteContent()`,
 *   and does not touch the registry.
 *
 * If somehow invoked in production (should not happen — the route is not
 * registered), the component renders a defensive message instead of the tool.
 */
export default function DevPreview() {
  if (process.env.NODE_ENV === "production") {
    return (
      <main>
        <Container className="py-12">
          <h1 className="text-2xl font-semibold text-foreground">
            Development preview — not available in production
          </h1>
          <p className="mt-2 text-muted-foreground">
            This route is registered only in development mode.
          </p>
        </Container>
      </main>
    );
  }

  return (
    <main>
      <Container className="py-12">
        <div className="mb-6 rounded-md border border-warning bg-warning-muted px-4 py-3 text-sm text-foreground">
          <strong>Development preview</strong> — this route is not part of the
          production site. It renders the real converter component for visual
          review only.
        </div>
        <h1 className="mb-8 text-3xl font-semibold tracking-tight text-foreground">
          JSON ↔ YAML Converter — Preview
        </h1>
        <JsonYamlConverter />
      </Container>
    </main>
  );
}