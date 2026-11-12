import { Container } from "../../ui/container";
import { PageHeader } from "../../ui/page-header";
import { Breadcrumbs, type BreadcrumbItem } from "../../ui/breadcrumbs";
import { buildPageMeta } from "../seo/site-meta";
import type { Route } from "./+types/contact";

export function meta({}: Route.MetaArgs) {
  return buildPageMeta({
    title: "Contact",
    description: "Contact information for the tools platform.",
    path: "/contact",
  });
}

export default function ContactPage() {
  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Home", to: "/" },
    { label: "Contact" },
  ];

  return (
    <main>
      <Container className="py-10 sm:py-14">
        <Breadcrumbs items={breadcrumbs} />

        <div className="mt-6 max-w-2xl">
          <PageHeader
            title="Contact"
            description="How to reach us."
          />

          <div className="mt-8 space-y-6 text-base text-muted-foreground">
            <section aria-labelledby="website-support-heading">
              <h2
                id="website-support-heading"
                className="text-lg font-semibold text-foreground"
              >
                Website Support
              </h2>
              <p className="mt-3">
                Having trouble using a tool, found an incorrect result, or
                noticed a problem with the website? We welcome reports about:
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-6">
                <li>Broken tools or controls that do not respond</li>
                <li>Incorrect or unexpected results from a tool</li>
                <li>Technical issues with the website itself</li>
                <li>General feedback about the website</li>
              </ul>
            </section>

            <section aria-labelledby="contact-email-heading">
              <h2
                id="contact-email-heading"
                className="text-lg font-semibold text-foreground"
              >
                How to reach us
              </h2>
              <p className="mt-3">
                For bug reports, technical issues, suggestions, or general
                website feedback, contact us at{" "}
                <a
                  href="mailto:symblend.labs@gmail.com"
                  className="text-primary underline decoration-primary/40 underline-offset-2 hover:text-primary-hover hover:decoration-primary-hover"
                >
                  symblend.labs@gmail.com
                </a>
                .
              </p>
              <p className="mt-3">
                Please include the tool name and a brief description of the
                issue so we can investigate it.
              </p>
            </section>
          </div>
        </div>
      </Container>
    </main>
  );
}