/**
 * Fetch target page with SSRF validation and manual redirect handling (via central fetch gate).
 */
import { fetchHtmlPage } from '../lib/fetch-gate';

export type FetchPageResult =
  | { ok: true; html: string; finalUrl: string; headers: Record<string, string> }
  | { ok: false; reason: string; status?: number; headers?: Record<string, string> };

export async function fetchPage(rawUrl: string): Promise<FetchPageResult> {
  return fetchHtmlPage(rawUrl);
}
