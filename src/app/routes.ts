import { type RouteConfig, index, route } from "@react-router/dev/routes";

const isDev = process.env.NODE_ENV !== "production";

export default [
  index("./routes/_index.tsx"),
  route("tools", "./routes/tools.tsx"),
  route("tools/:slug", "./routes/tool.tsx"),
  route("categories", "./routes/categories.tsx"),
  route("categories/:slug", "./routes/category.tsx"),
  route("guides", "./routes/guides.tsx"),
  route("guides/:id", "./routes/guide.tsx"),
  route("about", "./routes/about.tsx"),
  route("contact", "./routes/contact.tsx"),
  route("privacy", "./routes/privacy.tsx"),
  route("terms", "./routes/terms.tsx"),
  route("*", "./routes/not-found.tsx"),
  ...(isDev
    ? [
        route("__dev-preview", "./routes/__dev-preview.tsx"),
        route("__dev-preview/:toolId", "./routes/__dev-preview.$toolId.tsx"),
      ]
    : []),
] satisfies RouteConfig;