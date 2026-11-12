import { lazy, Suspense } from "react";
import { Link } from "react-router";
import { getToolBySlug } from "../../../private/integration/load-site-content";
import { toolLoaders } from "../../tools/_loaders";
import { Container } from "../../ui/container";
import { PageHeader } from "../../ui/page-header";
import { Breadcrumbs, type BreadcrumbItem } from "../../ui/breadcrumbs";
import { buildPageMeta } from "../seo/site-meta";
import type { Route } from "./+types/tool";

export async function loader({ params }: Route.LoaderArgs) {
  const tool = await getToolBySlug(params.slug);
  if (!tool) {
    throw new Response("Tool not found", { status: 404 });
  }
  return { tool };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) {
    return [
      { title: "Tool not found" },
      { name: "robots", content: "noindex, nofollow" },
    ];
  }
  const tool = loaderData.tool;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: tool.name,
    description: tool.description,
    applicationCategory: "UtilityApplication",
    operatingSystem: "Any",
  };
  return buildPageMeta({
    title: tool.name,
    description: tool.description,
    path: `/tools/${tool.slug}`,
    jsonLd,
  });
}

interface SectionHeadingProps {
  id: string;
  children: string;
}

function SectionHeading({ id, children }: SectionHeadingProps) {
  return (
    <h2
      id={id}
      className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
    >
      {children}
    </h2>
  );
}

interface ToolInterfaceProps {
  slug: string;
}

function ToolInterface({ slug }: ToolInterfaceProps) {
  const moduleLoader = toolLoaders[slug];

  if (!moduleLoader) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-muted px-6 py-12 text-center">
        <p className="text-sm font-medium text-foreground">
          This tool is not yet available
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          The interface is being prepared and will appear here when ready.
        </p>
      </div>
    );
  }

  const ToolComponent = lazy(moduleLoader);
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-border bg-surface px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">Loading interface…</p>
        </div>
      }
    >
      <ToolComponent />
    </Suspense>
  );
}

export default function ToolPage({ loaderData }: Route.ComponentProps) {
  const { tool } = loaderData;
  const { content } = tool;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Home", to: "/" },
    { label: "Tools", to: "/tools" },
    { label: tool.name },
  ];

  const hasInstructions = content.instructions.length > 0;
  const hasExamples = content.examples.length > 0;
  const hasFaqs = content.faqs.length > 0;
  const hasReferences = content.references.length > 0;

  return (
    <main>
      <Container className="py-10 sm:py-14">
        <Breadcrumbs items={breadcrumbs} />

        <div className="mt-6">
          <PageHeader title={tool.name} description={tool.description} />
        </div>

        <div className="mt-8">
          <ToolInterface slug={tool.slug} />
        </div>

        <div className="mt-16 space-y-12">
          {hasInstructions ? (
            <section aria-labelledby="instructions-heading">
              <SectionHeading id="instructions-heading">Instructions</SectionHeading>
              <ol className="mt-6 space-y-4">
                {content.instructions.map((instruction) => (
                  <li
                    key={instruction.id}
                    className="flex gap-4 rounded-lg border border-border bg-surface p-4"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-foreground"
                    >
                      {instruction.step}
                    </span>
                    <p className="text-sm text-foreground">{instruction.text}</p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {hasExamples ? (
            <section aria-labelledby="examples-heading">
              <SectionHeading id="examples-heading">Examples</SectionHeading>
              <ul className="mt-6 space-y-4">
                {content.examples.map((example) => (
                  <li
                    key={example.id}
                    className="rounded-lg border border-border bg-surface p-5"
                  >
                    <h3 className="text-sm font-semibold text-foreground">
                      {example.title}
                    </h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-subtle-foreground">
                          Input
                        </p>
                        <pre className="mt-1 overflow-x-auto rounded-md bg-surface-muted p-3 text-xs text-foreground">
                          <code>{example.input}</code>
                        </pre>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-subtle-foreground">
                          Output
                        </p>
                        <pre className="mt-1 overflow-x-auto rounded-md bg-surface-muted p-3 text-xs text-foreground">
                          <code>{example.output}</code>
                        </pre>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {hasFaqs ? (
            <section aria-labelledby="faqs-heading">
              <SectionHeading id="faqs-heading">
                Frequently asked questions
              </SectionHeading>
              <dl className="mt-6 space-y-6">
                {content.faqs.map((faq) => (
                  <div
                    key={faq.id}
                    className="rounded-lg border border-border bg-surface p-5"
                  >
                    <dt>
                      <h3 className="text-sm font-semibold text-foreground">
                        {faq.question}
                      </h3>
                    </dt>
                    <dd className="mt-2 text-sm text-muted-foreground">
                      {faq.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {hasReferences ? (
            <section aria-labelledby="references-heading">
              <SectionHeading id="references-heading">References</SectionHeading>
              <ul className="mt-6 space-y-2">
                {content.references.map((reference) => (
                  <li key={reference.id}>
                    <a
                      href={reference.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary underline decoration-primary/40 underline-offset-2 hover:text-primary-hover hover:decoration-primary-hover"
                    >
                      {reference.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </Container>
    </main>
  );
}