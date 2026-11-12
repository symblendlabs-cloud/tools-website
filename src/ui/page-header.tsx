import type { ReactNode } from "react";

export type HeadingLevel = 1 | 2 | 3;

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  headingLevel?: HeadingLevel;
  className?: string;
}

const HEADING_CLASSES: Record<HeadingLevel, string> = {
  1: "text-3xl sm:text-4xl font-semibold tracking-tight",
  2: "text-2xl sm:text-3xl font-semibold tracking-tight",
  3: "text-xl sm:text-2xl font-semibold tracking-tight",
};

export function PageHeader({
  title,
  description,
  actions,
  headingLevel = 1,
  className = "",
}: PageHeaderProps) {
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";
  const hasActions = actions !== undefined && actions !== null;

  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${className}`}>
      <div className="min-w-0">
        <Heading className={`${HEADING_CLASSES[headingLevel]} text-foreground`}>
          {title}
        </Heading>
        {description ? (
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {hasActions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}