import { Link } from "react-router";

export interface CategoryCardData {
  slug: string;
  name: string;
  description: string;
}

export interface CategoryCardProps {
  category: CategoryCardData;
  toolCount?: number;
}

export function CategoryCard({ category, toolCount }: CategoryCardProps) {
  const showCount = typeof toolCount === "number" && toolCount >= 0;

  return (
    <Link
      to={`/categories/${category.slug}/`}
      className="group flex h-full flex-col gap-2 rounded-lg border border-border bg-surface p-5 no-underline transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:border-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
          {category.name}
        </h3>
        {showCount ? (
          <span className="shrink-0 rounded-sm border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {toolCount} {toolCount === 1 ? "tool" : "tools"}
          </span>
        ) : null}
      </div>
      <p className="line-clamp-2 text-sm text-muted-foreground">
        {category.description}
      </p>
    </Link>
  );
}