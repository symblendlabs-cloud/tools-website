const VITE_SITE_ORIGIN = import.meta.env.VITE_SITE_ORIGIN as string | undefined;
const VITE_BASE_PATH = import.meta.env.VITE_BASE_PATH as string | undefined;
function validateOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      "SITE_ORIGIN must be a valid URL. Received an unparseable value.",
    );
  }
  if (url.protocol !== "https:") {
    throw new Error("SITE_ORIGIN must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("SITE_ORIGIN must not include credentials.");
  }
  if (url.search || url.hash) {
    throw new Error("SITE_ORIGIN must not include query or fragment.");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("SITE_ORIGIN must be a bare origin without a path.");
  }
  return url.origin;
}

export function getSiteOrigin(): string | null {
  const raw = VITE_SITE_ORIGIN;
  if (!raw || raw.trim().length === 0) {
    return null;
  }
  return validateOrigin(raw.trim());
}

export function canonicalUrl(path: string): string | null {
  const origin = getSiteOrigin();
  if (!origin) return null;

  const withoutQuery = path.split("?")[0] ?? "";
  const withoutFragment = withoutQuery.split("#")[0] ?? "";
  let normalized = withoutFragment;
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  normalized = normalized.replace(/\/+/g, "/");
  if (normalized !== "/" && !normalized.endsWith("/")) {
    normalized = `${normalized}/`;
  }
const rawBasePath =
  VITE_BASE_PATH && VITE_BASE_PATH !== "undefined"
    ? VITE_BASE_PATH
    : "/";

const basePath = rawBasePath.replace(/^\/+|\/+$/g, "");
const prefix = basePath ? `/${basePath}` : "";

return `${origin}${prefix}${normalized}`;
}

export interface PageMetaInput {
  title: string;
  description: string;
  path: string;
  robots?: string;
  type?: "website" | "article";
  jsonLd?: Record<string, unknown>;
}

export function buildPageMeta(input: PageMetaInput): Array<Record<string, unknown>> {
  const canonical = canonicalUrl(input.path);
  const meta: Array<Record<string, unknown>> = [
    { title: input.title },
    { name: "description", content: input.description },
    { name: "robots", content: input.robots ?? "index, follow" },
    { property: "og:title", content: input.title },
    { property: "og:description", content: input.description },
    { property: "og:type", content: input.type ?? "website" },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: input.title },
    { name: "twitter:description", content: input.description },
  ];
  if (canonical) {
    meta.push({ tagName: "link", rel: "canonical", href: canonical });
    meta.push({ property: "og:url", content: canonical });
  }
  if (input.jsonLd) {
    meta.push({ "script:ld+json": input.jsonLd });
  }
  return meta;
}