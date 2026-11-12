import type { Config } from "@react-router/dev/config";
import { getSiteContent } from "./private/integration/load-site-content";

export default {
  appDirectory: "src/app",
  buildDirectory: "build",
  ssr: false,
  async prerender({ getStaticPaths }) {
    const { tools, categories, articles } = await getSiteContent();
    return [
      ...getStaticPaths(),
      ...tools.map((t) => `/tools/${t.slug}`),
      ...categories.map((c) => `/categories/${c.slug}`),
      ...articles.map((a) => `/guides/${a.id}`),
      "/404",
    ];
  },
} satisfies Config;