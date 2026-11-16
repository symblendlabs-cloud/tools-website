
import { defineConfig, loadEnv } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const rawBasePath = env.VITE_BASE_PATH || "/";

  const basePath =
    rawBasePath === "/"
      ? "/"
      : `/${rawBasePath.replace(/^\/+|\/+$/g, "")}/`;

  return {
    base: basePath,
    plugins: [reactRouter(), tailwindcss()],
    define: {
      "import.meta.env.VITE_BASE_PATH": JSON.stringify(basePath),
    },
  };
});
