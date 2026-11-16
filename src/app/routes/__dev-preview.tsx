import { Link } from "react-router";
import { Container } from "../../ui/container";
import { toolLoaders } from "../../tools/_loaders";

/**
 * DEVELOPMENT-ONLY PREVIEW INDEX
 *
 * Lists the tools that are available for local visual review via
 * `/__dev-preview/<toolId>`. Preview access does NOT change a tool's
 * registry status or visibility — a tool listed here may still be
 * `testing`/`private` and will continue to 404 at `/tools/<slug>/`.
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
 * registered), the component renders a defensive message instead.
 */

const PREVIEW_TOOLS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "json-yaml-converter", label: "JSON ↔ YAML Converter" },
  { id: "iso27001-control-mapping-checker", label: "ISO 27001 Control Mapping Checker" },
];

export default function DevPreviewIndex() {
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

  const available = PREVIEW_TOOLS.filter((t) => Object.hasOwn(toolLoaders, t.id));

  return (
    <main>
      <Container className="py-12">
        <div className="mb-6 rounded-md border border-warning bg-warning-muted px-4 py-3 text-sm text-foreground">
          <strong>Development preview</strong> — this page is not part of the
          production site. Previews let you review tool UIs locally without
          promoting the tool to <code>ready</code>/<code>public</code> in the
          registry. Registry status and public availability are not changed
          by preview access.
        </div>

        <h1 className="mb-8 text-3xl font-semibold tracking-tight text-foreground">
          Development previews
        </h1>

        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No previewable tools are currently registered in <code>toolLoaders</code>.
          </p>
        ) : (
          <ul className="space-y-3">
            {available.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/__dev-preview/${t.id}`}
                  className="block rounded-lg border border-border bg-surface p-4 no-underline transition-colors hover:border-border-strong hover:bg-surface-muted"
                >
                  <span className="font-medium text-foreground">{t.label}</span>
                  <code className="ml-3 text-xs text-muted-foreground">{t.id}</code>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 text-xs text-muted-foreground">
          These URLs are available only when the dev server is running with
          <code className="mx-1">NODE_ENV !== "production"</code>. The normal
          public route <code>/tools/&lt;slug&gt;/</code> is unaffected and
          continues to return 404 for any tool that is not
          <code className="mx-1">status: "ready"</code> and
          <code className="mx-1">visibility: "public"</code>.
        </p>
      </Container>
    </main>
  );
}