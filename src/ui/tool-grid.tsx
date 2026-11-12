import { ToolCard, type ToolCardData } from "./tool-card";

export interface ToolGridProps {
  tools: ToolCardData[];
  emptyFallback?: React.ReactNode;
}

export function ToolGrid({ tools, emptyFallback = null }: ToolGridProps) {
  if (tools.length === 0) {
    return <>{emptyFallback}</>;
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <li key={tool.slug} className="h-full">
          <ToolCard tool={tool} />
        </li>
      ))}
    </ul>
  );
}