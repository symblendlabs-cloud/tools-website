import { getArticleById } from "../../../private/integration/load-site-content";
import { Container } from "../../ui/container";
import { PageHeader } from "../../ui/page-header";
import { Breadcrumbs, type BreadcrumbItem } from "../../ui/breadcrumbs";
import { buildPageMeta } from "../seo/site-meta";
import type { Route } from "./+types/guide";

export async function loader({ params }: Route.LoaderArgs) {
  const article = await getArticleById(params.id);

  if (!article) {
    throw new Response("Guide not found", { status: 404 });
  }

  return { article };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) {
    return [
      { title: "Guide not found" },
      { name: "robots", content: "noindex, nofollow" },
    ];
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: loaderData.article.title,
    description: loaderData.article.description,
  };

  return buildPageMeta({
    title: loaderData.article.title,
    description: loaderData.article.description,
    path: `/guides/${loaderData.article.id}`,
    type: "article",
    jsonLd,
  });
}

export default function GuidePage({ loaderData }: Route.ComponentProps) {
  const { article } = loaderData;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Home", to: "/" },
    { label: "Guides", to: "/guides/" },
    { label: article.title },
  ];

  return (
    <main>
      <Container className="py-10 sm:py-14">
        <Breadcrumbs items={breadcrumbs} />

        <div className="mt-6">
          <PageHeader
            title={article.title}
            description={article.description}
          />
        </div>

        <article className="mt-10 max-w-3xl">
          <div
            className="guide-prose"
            dangerouslySetInnerHTML={{ __html: article.body }}
          />
        </article>
      </Container>
    </main>
  );
}