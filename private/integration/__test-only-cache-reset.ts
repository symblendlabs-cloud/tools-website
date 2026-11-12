/**
 * Test-only cache reset helper.
 *
 * NOT part of the production public API. Not re-exported from any production
 * entry point. Only the test suite imports this file.
 */
import { clearCachedPromise } from "./cache-store";

export function resetSiteContentCacheForTests(): void {
  clearCachedPromise();
}