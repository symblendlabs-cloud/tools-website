import { Link } from "react-router";
import { Container } from "../../ui/container";
import { PageHeader } from "../../ui/page-header";
import { buildPageMeta } from "../seo/site-meta";
import type { Route } from "./+types/not-found";

export function meta({}: Route.MetaArgs) {
  return buildPageMeta({
    title: "Page not found",
    description: "The requested page could not be found.",
    path: "/404",
    robots: "noindex, nofollow",
  });
}

export default function NotFound() {
  return (
    <main>
      <Container className="py-20 sm:py-28 lg:py-32">
        <div className="mx-auto max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-wider text-primary">
            404
          </p>
          <div className="mt-4">
            <PageHeader
              title="Page not found"
              description="The page you are looking for may have moved, been removed, or never existed. Check the URL, or head back to a known page using the links below."
            />
          </div>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to="/tools/"
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground no-underline transition-colors hover:bg-primary-hover focus-visible:bg-primary-hover"
            >
              Explore tools
            </Link>
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground no-underline transition-colors hover:border-border-strong hover:bg-surface-muted"
            >
              Go to homepage
            </Link>
          </div>
        </div>
      </Container>
    </main>
  );
}