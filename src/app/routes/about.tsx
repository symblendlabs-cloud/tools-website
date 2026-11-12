import { Container } from "../../ui/container";
import { PageHeader } from "../../ui/page-header";
import { Breadcrumbs, type BreadcrumbItem } from "../../ui/breadcrumbs";
import { buildPageMeta } from "../seo/site-meta";
import type { Route } from "./+types/about";

export function meta({}: Route.MetaArgs) {
  return buildPageMeta({
    title: "About",
    description: "About the modular browser-based tools platform.",
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
            description="A modular collection of browser-based utilities for developers and IT professionals."
          />

          <div className="mt-8 space-y-4 text-base text-muted-foreground">
            <p>
              This platform provides a growing collection of tools that run
              entirely in your browser. Every tool processes its data locally —
              nothing is uploaded to a server, and no account is required.
            </p>
            <p>
              The tools are designed for developer and IT workflows: parsing,
              formatting, converting, validating, and inspecting data. They
              work on any modern browser and are built to be fast, focused, and
              privacy-respecting.
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