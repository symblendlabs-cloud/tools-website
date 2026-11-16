import type { ComponentType } from "react";

export type ToolModuleLoader = () => Promise<{ default: ComponentType }>;

export const toolLoaders: Record<string, ToolModuleLoader> = {
  "json-yaml-converter": () => import("./json-yaml-converter/index"),
  "graphql-persisted-query-hash": () => import("./graphql-persisted-query-hash/index"),
  "otel-trace-context-propagator": () =>  import("./otel-trace-context-propagator/index"),
  "ebpf-tracepoint-syntax-helper": () => import("./ebpf-tracepoint-syntax-helper/index"),
  "pci-dss-compliance-gap-analyzer": () => import("./pci-dss-compliance-gap-analyzer/index"),
  "wasm-memory-layout-visualizer": () => import("./wasm-memory-layout-visualizer/index"),
    "temporal-workflow-payload-viewer": () => import("./temporal-workflow-payload-viewer/index"),
  "iso27001-control-mapping-checker": () => import("./iso27001-control-mapping-checker/index"),
};