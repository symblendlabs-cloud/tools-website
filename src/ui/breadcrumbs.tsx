import { Link } from "react-router";

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  ariaLabel?: string;
}

export function Breadcrumbs({ items, ariaLabel = "Breadcrumb" }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={ariaLabel}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {isLast ? (
                <span aria-current="page" className="font-medium text-foreground">
                  {item.label}
                </span>
              ) : item.to ? (
                <Link
                  to={item.to}
                  className="text-muted-foreground no-underline hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span>{item.label}</span>
              )}
              {!isLast ? (
                <span aria-hidden="true" className="text-subtle-foreground">
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}