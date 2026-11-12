import { Link } from "react-router";

export interface ToolCardData {
  slug: string;
  name: string;
  description: string;
  tags: string[];
}

export interface ToolCardProps {
  tool: ToolCardData;
}

const MAX_TAGS = 3;

export function ToolCard({ tool }: ToolCardProps) {
  const visibleTags = tool.tags.slice(0, MAX_TAGS);

  return (
    <Link
      to={`/tools/${tool.slug}`}
      className="group flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-5 no-underline transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:border-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
          {tool.name}
        </h3>
        <span
          aria-hidden="true"
          className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40 transition-colors group-hover:bg-primary"
        />
      </div>

      <p className="line-clamp-2 text-sm text-muted-foreground">
        {tool.description}
      </p>

      {visibleTags.length > 0 ? (
        <ul className="mt-auto flex flex-wrap gap-1.5" aria-label="Tags">
          {visibleTags.map((tag) => (
            <li
              key={tag}
              className="rounded-sm border border-border bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
    </Link>
  );
}