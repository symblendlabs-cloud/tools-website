import type { PublicContentOutput } from "../content";

/**
 * Build-time cache store for the site content Promise.
 *
 * This module owns the module-level cache state so that:
 *   - load-site-content.ts owns the loading logic but not the cache storage.
 *   - Test-only code can reset the cache without any production module
 *     exposing a reset function.
 *
 * The API here is generic enough to be a legitimate production utility: it
 * exposes the current cached promise, sets it, and clears it.
 */

let cachedPromise: Promise<PublicContentOutput> | null = null;

export function getCachedPromise(): Promise<PublicContentOutput> | null {
  return cachedPromise;
}

export function setCachedPromise(p: Promise<PublicContentOutput>): void {
  cachedPromise = p;
}

export function clearCachedPromise(): void {
  cachedPromise = null;
}