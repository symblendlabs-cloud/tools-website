import { Container } from "../../ui/container";
import { PageHeader } from "../../ui/page-header";
import { Breadcrumbs, type BreadcrumbItem } from "../../ui/breadcrumbs";
import { buildPageMeta } from "../seo/site-meta";
import type { Route } from "./+types/terms";

export function meta({}: Route.MetaArgs) {
  return buildPageMeta({
    title: "Terms of Service",
    description: "Terms of service for the browser-based tools platform.",
    path: "/terms",
  });
}

export default function TermsPage() {
  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Home", to: "/" },
    { label: "Terms" },
  ];

  return (
    <main>
      <Container className="py-10 sm:py-14">
        <Breadcrumbs items={breadcrumbs} />

        <div className="mt-6 max-w-3xl">
          <PageHeader
            title="Terms of Service"
            description="Initial terms for using this website."
          />

          <div className="mt-8 space-y-6 text-base text-muted-foreground">
            <section>
              <h2 className="text-lg font-semibold text-foreground">
                Acceptable use
              </h2>
              <p className="mt-3">
                You may use the tools on this website for lawful purposes
                only. You agree not to use the site to process illegal
                content, to attempt to compromise the site's security, or to
                interfere with other users.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">
                Outputs provided as-is
              </h2>
              <p className="mt-3">
                All tool outputs are provided "as is" without warranty of
                correctness, completeness, or fitness for a particular
                purpose. You are responsible for verifying any output before
                relying on it.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">
                Availability
              </h2>
              <p className="mt-3">
                The website is provided on a best-effort basis. No guarantee
                of uptime, availability, or continuity of any tool is made.
                The set of available tools may change at any time.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">
                Limitation of liability
              </h2>
              <p className="mt-3">
                To the maximum extent permitted by law, the operators of this
                website are not liable for any damages arising from the use of
                or reliance on the site or its tools. Because all processing
                occurs in your browser, you are responsible for your input and
                any resulting output.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">
                Intellectual property
              </h2>
              <p className="mt-3">
                The website's source code, design, and content are protected
                by applicable intellectual property law. You may use the tools
                as intended but may not reproduce, redistribute, or resell the
                website itself without permission.
              </p>
            </section>

            <p className="text-sm text-subtle-foreground italic">
              These terms are initial and subject to legal review before
              production launch. They should be updated as the website and its
              services evolve.
            </p>
          </div>
        </div>
      </Container>
    </main>
  );
}