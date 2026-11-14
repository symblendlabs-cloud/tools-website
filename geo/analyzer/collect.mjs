/**
 * Content collector — source mode.
 *
 * Calls getSiteContent() from private/integration/load-site-content.ts.
 * Reads only the public projection. Never touches private/registry/data/*.
 */

import { getSiteContent } from "../../private/integration/load-site-content.ts";

/**
 * Build a page record for a tool.
 *
 * @param {object} tool - PublicToolWithContent
 * @param {string} origin
 */
function toolToPage(tool, origin) {
  const content = tool.content ?? {};
  return {
    url: `${origin}/tools/${tool.slug}/`,
    type: "tool",
    title: typeof content.title === "string" ? content.title : tool.name,
    description:
      typeof content.summary === "string" ? content.summary : tool.description,
    faqs: Array.isArray(content.faqs) ? content.faqs : [],
    // Dates are not present in the current projection. Preserve if the shape
    // ever adds them.
    datePublished: content.datePublished,
    dateModified: content.dateModified,
  };
}

/**
 * Build a page record for an article.
 *
 * The public projection exposes id, title, description, body. It does not
 * (currently) expose publication dates.
 *
 * @param {object} article - PublicArticle
 * @param {string} origin
 */
function articleToPage(article, origin) {
  return {
    url: `${origin}/guides/${article.id}/`,
    type: "guide",
    title: article.title,
    description: article.description,
    datePublished: article.datePublished,
    dateModified: article.dateModified,
  };
}

/**
 * Build a page record for a category.
 *
 * @param {object} category - PublicCategory
 * @param {string} origin
 */
function categoryToPage(category, origin) {
  return {
    url: `${origin}/categories/${category.slug}/`,
    type: "category",
    title: category.name,
    description: category.description,
  };
}

/**
 * Collect pages from the public content projection.
 *
 * @param {object} options
 * @param {string} options.origin - site origin (e.g. https://chifral.pages.dev)
 * @returns {Promise<{ pages: object[] }>}
 */
export async function collectFromContent({ origin }) {
  if (typeof origin !== "string" || !origin.startsWith("https://")) {
    throw new Error(
      `collectFromContent: origin must be an HTTPS URL. Received: ${origin}`,
    );
  }

  let content;
  try {
    content = await getSiteContent();
  } catch (err) {
    throw new Error(
      `collectFromContent: failed to load public content. ${err.message}`,
    );
  }

  const pages = [];
  for (const tool of content.tools) pages.push(toolToPage(tool, origin));
  for (const article of content.articles) pages.push(articleToPage(article, origin));
  for (const category of content.categories) pages.push(categoryToPage(category, origin));

  return { pages };
}