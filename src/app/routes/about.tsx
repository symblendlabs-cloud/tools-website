import { Container } from "../../ui/container";
import { PageHeader } from "../../ui/page-header";
import { Breadcrumbs, type BreadcrumbItem } from "../../ui/breadcrumbs";
import { buildPageMeta } from "../seo/site-meta";
import type { Route } from "./+types/about";

export function meta({}: Route.MetaArgs) {
  return buildPageMeta({
    title: "About",
    description: "About Chifral, a collection of practical browser-based technology tools.",
    path: "/about",
  });
}

export default function AboutPage() {
  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Home", to: "/" },
    { label: "About" },
  ];

  return (
    <main>
      <Container className="py-10 sm:py-14">
        <Breadcrumbs items={breadcrumbs} />

        <div className="mt-6 max-w-3xl">
          <PageHeader
            title="About"
            description="A collection of practical browser-based tools for anyone working with technology."
          />

          <div className="mt-8 space-y-4 text-base text-muted-foreground">
            <p>
              Chifral brings together practical technology tools designed for
              anyone who wants to work with, understand, or explore technology.
              The tools are designed to process inputs in your browser. Processing and data handling may vary by tool. No account is required.
            </p>
            <p>
              Whether you are learning, working professionally, or solving a
              specific technical problem, the tools aim to make tasks clearer
              and easier. They work on any modern browser.
            </p>
            <p>
              The platform is actively being developed. New tools are added as
              they become available, and existing tools are refined based on
              real usage.
            </p>
          </div>
        </div>
      </Container>
    </main>
  );
}