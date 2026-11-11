import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "src/app",
  buildDirectory: "build",
  ssr: false,
  async prerender() {
    // TEMPORARY CONFIGURATION-STAGE PLACEHOLDER.
    // Prerenders only the root path to validate the pipeline.
    // NOT PRODUCTION-READY: the final implementation must enumerate every
    // required public route (directory, categories, all 241 tool routes,
    // and help pages) from the private Tool Registry and the public
    // tools-content JSON, without importing tool implementations.
    return ["/"];
  },
} satisfies Config;