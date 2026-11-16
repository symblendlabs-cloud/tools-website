import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Container } from "../../ui/container";
import { toolLoaders } from "../../tools/_loaders";

/**
 * DEVELOPMENT-ONLY PER-TOOL PREVIEW
 *
 * Renders a single tool from the explicit preview allowlist via the shared
 * `toolLoaders` map — the same loader used by `/tools/:slug`. Does not
 * import any tool component statically and does not touch the registry.
 *
 * SAFETY:
 * - This route is registered in `src/app/routes.ts` ONLY when
 *   `process.env.NODE_ENV !== "production"`.
 * - The component also guards against production rendering as defence in
 *   depth.
 * - The tool's normal public route (`/tools/<slug>/`) is unaffected and
 *   continues to 404 for tools that are `testing`/`private`.
 *
 * NOTE: this project builds with `ssr: false`, so the route intentionally
 * does NOT export a `loader` (React Router 8 rejects loaders on routes
 * prerendered with ssr:false). Validation happens in the component via
 * `useParams()` and unknown IDs are redirected to the 404 page.
 */

const PREVIEW_TOOL_IDS = [
  "json-yaml-converter",
  "iso27001-control-mapping-checker",
] as const;

type PreviewToolId = (typeof PREVIEW_TOOL_IDS)[number];

// Module-scope stable lazy components — created exactly once per module load.
// Avoids re-creating a React.lazy component on every render, which would
// remount the tool and lose its in-memory state.
const PREVIEW_COMPONENTS: Record<PreviewToolId, LazyExoticComponent<ComponentType>> = {
  "json-yaml-converter": lazy(toolLoaders["json-yaml-converter"]!),
  "iso27001-control-mapping-checker": lazy(toolLoaders["iso27001-control-mapping-checker"]!),
};

function isPreviewToolId(id: string | undefined): id is PreviewToolId {
  if (!id) return false;
  return (PREVIEW_TOOL_IDS as readonly string[]).includes(id);
}

export default function DevPreviewTool() {
  const params = useParams();
  const toolId = params.toolId;

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

  if (!isPreviewToolId(toolId) || !Object.hasOwn(toolLoaders, toolId)) {
    // Client-side 404: React Router runs with ssr:false, so there is no
    // server status code to set here. Redirect to the app's 404 page.
    return <Navigate to="/404" replace />;
  }

  const ToolComponent = PREVIEW_COMPONENTS[toolId];

  return (
    <main>
      <Container className="py-12">
        <div className="mb-6 rounded-md border border-warning bg-warning-muted px-4 py-3 text-sm text-foreground">
          <strong>Development preview</strong> — <code>{toolId}</code> — this
          route is not part of the production site. Registry status and public
          availability of this tool are unchanged.
        </div>

        <p className="mb-6 text-sm">
          <Link to="/__dev-preview" className="text-primary underline decoration-primary/40 underline-offset-2 hover:text-primary-hover hover:decoration-primary-hover">
            ← All previews
          </Link>
        </p>

        <Suspense
          fallback={
            <div className="rounded-lg border border-border bg-surface px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">Loading interface…</p>
            </div>
          }
        >
          <ToolComponent />
        </Suspense>
      </Container>
    </main>
  );
}