import { Link } from "react-router";
import { getAllArticles } from "../../../private/integration/load-site-content";
import { Container } from "../../ui/container";
import { PageHeader } from "../../ui/page-header";
import { Breadcrumbs, type BreadcrumbItem } from "../../ui/breadcrumbs";
import { EmptyState } from "../../ui/empty-state";
import { buildPageMeta } from "../seo/site-meta";
import type { Route } from "./+types/guides";

export async function loader() {
  const articles = await getAllArticles();
  return { articles };
}

export function meta({}: Route.MetaArgs) {
  return buildPageMeta({
    title: "Guides",
    description:
      "Technical guides and educational articles for developers and IT professionals.",
    path: "/guides",
  });
}

export default function GuidesDirectory({ loaderData }: Route.ComponentProps) {
  const { articles } = loaderData;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Home", to: "/" },
    { label: "Guides" },
  ];

  return (
    <main>
      <Container className="py-10 sm:py-14">
        <Breadcrumbs items={breadcrumbs} />

        <div className="mt-6">
          <PageHeader
            title="Guides"
            description="Technical guides and educational articles to help you get the most out of browser-based tools."
          />
        </div>

        <div className="mt-10">
          {articles.length === 0 ? (
            <EmptyState
              title="No guides available yet"
              description="We are preparing technical guides. They will appear here as they become available."
            />
          ) : (
            <ul className="space-y-4">
              {articles.map((article) => (
                <li key={article.id}>
                  <Link
                    to={`/guides/${article.id}/`}
                    className="group block rounded-lg border border-border bg-surface p-6 no-underline transition-colors hover:border-border-strong hover:bg-surface-elevated"
                  >
                    <h2 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                      {article.title}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {article.description}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>
    </main>
  );
}