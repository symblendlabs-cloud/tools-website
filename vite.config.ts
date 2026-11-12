import { defineConfig, loadEnv } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const siteOrigin = env.SITE_ORIGIN ?? "";

  return {
    plugins: [reactRouter(), tailwindcss()],
    define: {
      "import.meta.env.VITE_SITE_ORIGIN": JSON.stringify(siteOrigin),
    },
  };
});