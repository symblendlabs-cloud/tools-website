import {
  getCategoryBySlug,
  getAllTools,
} from "../../../private/integration/load-site-content";
import { Container } from "../../ui/container";
import { PageHeader } from "../../ui/page-header";
import { Breadcrumbs, type BreadcrumbItem } from "../../ui/breadcrumbs";
import { ToolGrid } from "../../ui/tool-grid";
import { EmptyState } from "../../ui/empty-state";
import { buildPageMeta, canonicalUrl } from "../seo/site-meta";
import type { Route } from "./+types/category";

export async function loader({ params }: Route.LoaderArgs) {
  const category = await getCategoryBySlug(params.slug);
  if (!category) {
    throw new Response("Category not found", { status: 404 });
  }
  const allTools = await getAllTools();
  const tools = allTools.filter((t) => t.categoryId === category.id);
  return { category, tools };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) {
    return [{ title: "Category not found" }, { name: "robots", content: "noindex, nofollow" }];
  }
  const homeUrl = canonicalUrl("/");
  const categoriesUrl = canonicalUrl("/categories/");
  const categoryUrl = canonicalUrl(`/categories/${loaderData.category.slug}/`);

  const jsonLd =
    homeUrl && categoriesUrl && categoryUrl
      ? {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: homeUrl },
            { "@type": "ListItem", position: 2, name: "Categories", item: categoriesUrl },
            {
              "@type": "ListItem",
              position: 3,
              name: loaderData.category.name,
              item: categoryUrl,
            },
          ],
        }
      : null;

  return buildPageMeta({
    title: `${loaderData.category.name} Tools`,
    description: loaderData.category.description,
    path: `/categories/${loaderData.category.slug}/`,
    ...(jsonLd ? { jsonLd } : {}),
  });
}

export default function CategoryPage({ loaderData }: Route.ComponentProps) {
  const { category, tools } = loaderData;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Home", to: "/" },
    { label: "Categories", to: "/categories/" },
    { label: category.name },
  ];

  return (
    <main>
      <Container className="py-10 sm:py-14">
        <Breadcrumbs items={breadcrumbs} />

        <div className="mt-6">
          <PageHeader title={category.name} description={category.description} />
        </div>

        <div className="mt-10">
          {tools.length === 0 ? (
            <EmptyState
              title="No tools in this category yet"
              description="We are preparing tools for this category. They will appear here as they become available."
            />
          ) : (
            <ToolGrid tools={tools} />
          )}
        </div>
      </Container>
    </main>
  );
}