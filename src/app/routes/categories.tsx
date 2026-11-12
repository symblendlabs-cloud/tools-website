import { getAllCategories } from "../../../private/integration/load-site-content";
import { Container } from "../../ui/container";
import { PageHeader } from "../../ui/page-header";
import { Breadcrumbs, type BreadcrumbItem } from "../../ui/breadcrumbs";
import { CategoryCard } from "../../ui/category-card";
import { EmptyState } from "../../ui/empty-state";
import { buildPageMeta } from "../seo/site-meta";
import type { Route } from "./+types/categories";

export async function loader() {
  const categories = await getAllCategories();
  return { categories };
}

export function meta({}: Route.MetaArgs) {
  return buildPageMeta({
    title: "Categories",
    description: "Browse all tool categories available on the platform.",
    path: "/categories",
  });
}

export default function CategoriesDirectory({ loaderData }: Route.ComponentProps) {
  const { categories } = loaderData;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Home", to: "/" },
    { label: "Categories" },
  ];

  return (
    <main>
      <Container className="py-10 sm:py-14">
        <Breadcrumbs items={breadcrumbs} />

        <div className="mt-6">
          <PageHeader
            title="Categories"
            description="Browse tools grouped by category. Each category contains its own collection of browser-based utilities."
          />
        </div>

        <div className="mt-10">
          {categories.length === 0 ? (
            <EmptyState
              title="No categories available yet"
              description="We are preparing the first set of categories. They will appear here as tools become available."
            />
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <li key={category.id} className="h-full">
                  <CategoryCard category={category} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>
    </main>
  );
}