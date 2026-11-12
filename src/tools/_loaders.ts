import type { ComponentType } from "react";

export type ToolModuleLoader = () => Promise<{ default: ComponentType }>;

export const toolLoaders: Record<string, ToolModuleLoader> = {
  "json-yaml-converter": () => import("./json-yaml-converter/index"),
  "graphql-persisted-query-hash": () => import("./graphql-persisted-query-hash/index"),
  "otel-trace-context-propagator": () =>  import("./otel-trace-context-propagator/index"),
};