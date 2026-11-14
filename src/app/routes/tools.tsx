import {
  Container,
} from "../../ui/container";
import { PageHeader } from "../../ui/page-header";
import { ToolGrid } from "../../ui/tool-grid";
import { EmptyState } from "../../ui/empty-state";
import { getAllTools } from "../../../private/integration/load-site-content";
import { buildPageMeta } from "../seo/site-meta";
import type { Route } from "./+types/tools";

export async function loader() {
  const tools = await getAllTools();
  return { tools };
}

export function meta({}: Route.MetaArgs) {
  return buildPageMeta({
    title: "Tools Directory",
    description: "Browse all available browser-based tools.",
    path: "/tools",
  });
}

export default function ToolsDirectory({ loaderData }: Route.ComponentProps) {
  const { tools } = loaderData;

  return (
    <main>
      <Container className="py-12 sm:py-16">
        <PageHeader
          title="Tools"
          description="A curated collection of browser-based tools for anyone working with technology.
Our tools are designed to process inputs in your browser.
Processing and data handling may vary by tool. No account is required."
        />

        <div className="mt-10">
          {tools.length === 0 ? (
            <EmptyState
              title="No tools available yet"
              description="We are preparing the first set of tools. Check back soon — each new tool will appear here as it becomes available."
            />
          ) : (
            <ToolGrid tools={tools} />
          )}
        </div>
      </Container>
    </main>
  );
}