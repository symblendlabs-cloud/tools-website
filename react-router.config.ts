import type { Config } from "@react-router/dev/config";
import { getSiteContent } from "./private/integration/load-site-content";

const rawBasePath = process.env.VITE_BASE_PATH || "/";
const basePath =
  rawBasePath === "/"
    ? "/"
    : `/${rawBasePath.replace(/^\/+|\/+$/g, "")}/`;

export default {
  appDirectory: "src/app",
  buildDirectory: "build",
  ssr: false,
  basename: basePath,
  async prerender({ getStaticPaths }) {
    const { tools, categories, articles } = await getSiteContent();

    const staticPaths = getStaticPaths();

    const normalizedStaticPaths = staticPaths
      .filter((path) => path !== "/404")
      .map((path) =>
        path === "/" ? path : `${path.replace(/\/+$/, "")}/`,
      );

    return [
      ...normalizedStaticPaths,
      ...tools.map((t) => `/tools/${t.slug}/`),
      ...categories.map((c) => `/categories/${c.slug}/`),
      ...articles.map((a) => `/guides/${a.id}/`),
      "/404",
    ];
  },
} satisfies Config;