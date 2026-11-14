import { Link } from "react-router";
import { Container } from "../../ui/container";
import { buildPageMeta } from "../seo/site-meta";
import type { Route } from "./+types/_index";

export function meta({}: Route.MetaArgs) {
  return buildPageMeta({
    title: "Chifral — Practical Technology Tools",
    description:
      "Explore practical browser-based tools for learning, understanding, and solving technology tasks.",
    path: "/",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Chifral",
      url: "https://chifral.pages.dev/",
      description:
        "Explore practical browser-based tools for learning, understanding, and solving technology tasks.",
    },
  });
}

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="border-b border-border bg-surface">
        <Container className="py-12 sm:py-16 lg:py-20">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-wider text-primary">
              Browser-based tools
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Technology tools,
              <br className="hidden sm:block" />
              <span className="text-muted-foreground">made simpler.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              Practical tools for parsing, formatting, converting, validating,
              and inspecting data — designed for anyone working with
              technology. Tool inputs are processed in your browser without
              uploads or accounts.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/tools"
                className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground no-underline transition-colors hover:bg-primary-hover focus-visible:bg-primary-hover"
              >
                Browse tools
              </Link>
              <Link
                to="/guides/"
                className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground no-underline transition-colors hover:border-border-strong hover:bg-surface-muted"
              >
                  Browse guides
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* Supporting section */}
      <section className="bg-background">
        <Container className="py-16 sm:py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Built for privacy, speed, and clarity
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              Tool logic runs client-side. There is no backend that processes
              your tool data, no account required, and no persistence of tool
              inputs. Open a tool, use it, and close the tab — your tool inputs
              are not stored.
            </p>

            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-surface p-5">
                <h3 className="text-sm font-semibold text-foreground">
                  Runs locally
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Tool inputs are processed in your browser without uploads or
                  accounts.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-5">
                <h3 className="text-sm font-semibold text-foreground">
                  No accounts
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  No sign-up, no email, no password. Tools are open to use
                  immediately, without any identity or session.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-5">
                <h3 className="text-sm font-semibold text-foreground">
                  Designed for clarity
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Thoughtful interfaces, keyboard-friendly controls, and output
                  you can copy, download, or compare directly.
                </p>
              </div>
            </div>

            <div className="mt-12">
              <Link
                to="/tools/"
                className="text-sm font-medium text-primary no-underline hover:text-primary-hover"
              >
                Explore the directory →
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}