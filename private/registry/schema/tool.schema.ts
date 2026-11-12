export const TOOL_STATUSES = [
  "planned",
  "in-progress",
  "testing",
  "ready",
  "deprecated",
] as const;

export type ToolStatus = (typeof TOOL_STATUSES)[number];

export const VISIBILITIES = ["private", "public"] as const;

export type Visibility = (typeof VISIBILITIES)[number];

export interface ToolRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  categoryId: string;
  status: ToolStatus;
  visibility: Visibility;
  implementation: {
    module: string;
    exportName: string;
  };
  contentId: string;
  tags: string[];
  metadata: {
    notes: string;
  };
}