import { getArticleById } from "../../../private/integration/load-site-content";
import { Container } from "../../ui/container";
import { PageHeader } from "../../ui/page-header";
import { Breadcrumbs, type BreadcrumbItem } from "../../ui/breadcrumbs";
import { buildPageMeta, canonicalUrl } from "../seo/site-meta";
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

  const article = {
    "@type": "Article",
    headline: loaderData.article.title,
    description: loaderData.article.description,
  };

  const homeUrl = canonicalUrl("/");
  const guidesUrl = canonicalUrl("/guides/");
  const guideUrl = canonicalUrl(`/guides/${loaderData.article.id}/`);

  const jsonLd =
    homeUrl && guidesUrl && guideUrl
      ? {
          "@context": "https://schema.org",
          "@graph": [
            article,
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: homeUrl },
                { "@type": "ListItem", position: 2, name: "Guides", item: guidesUrl },
                { "@type": "ListItem", position: 3, name: loaderData.article.title, item: guideUrl },
              ],
            },
          ],
        }
      : { "@context": "https://schema.org", ...article };

  return buildPageMeta({
    title: loaderData.article.title,
    description: loaderData.article.description,
    path: `/guides/${loaderData.article.id}/`,
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