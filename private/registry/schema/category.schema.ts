import type { ToolStatus, Visibility } from "./tool.schema";

export interface CategoryRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: ToolStatus;
  visibility: Visibility;
  metadata: {
    notes: string;
  };
}