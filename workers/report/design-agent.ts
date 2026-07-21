/**
 * Report design agent (issue #90) — makes the cover read like someone stopped and
 * designed this report for THIS business: a "Prepared for / Prepared by" block with
 * provenance (GEO-Pulse team · getgeopulse.com · Montréal, Québec), a credibility
 * strip backed by real facts from the scan engine, and — when Cloudflare Browser
 * Rendering is available — a screenshot of the audited site's own homepage.
 *
 * Admin-flagged: ON by default, killable from /admin/automation without a redeploy
 * (automation_settings row, feature 'report_design_agent'). Reads fail OPEN — this is
 * presentation, not autonomy, so a missing settings table must not strip the cover.
 * Every piece degrades independently: no screenshot ⇒ the block still renders; agent
 * off ⇒ the classic cover renders untouched.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AGENT_REGISTRY_VERSION } from '../scan-engine/agent-registry';
import { CHECK_CATALOG } from '../scan-engine/check-catalog';
import {
  browserRenderConfigFromEnv,
  hasBrowserRenderingCredentials,
  type BrowserRenderEnv,
} from '../scan-engine/browser-rendering';
import { validateEngineFetchUrl } from '../lib/ssrf';
import { isAgentEnabled } from '../../lib/server/agent-flags';
import { formatReportTimestamp } from './report-timestamp';
import { structuredLog } from '../../lib/server/structured-log';

export const DESIGN_AGENT_FEATURE = 'report_design_agent';

export interface CoverDesign {
  preparedForLines: string[];
  preparedByLines: string[];
  credibilityLines: string[];
  /** PNG bytes of the audited site's homepage, when capture succeeded. */
  heroImage: Uint8Array | null;
}

/**
 * The kill switch. Fail-OPEN by design: no row / no table (migration 048 unapplied)
 * means the agent runs. An explicit row with enabled=false or kill_switch=true turns
 * it off — that is the admin's one-click "switch it off".
 */
export async function isDesignAgentEnabled(supabase: SupabaseClient): Promise<boolean> {
  return isAgentEnabled(supabase, DESIGN_AGENT_FEATURE, { failOpen: true });
}

const SCREENSHOT_TIMEOUT_MS = 20_000;
const SCREENSHOT_MAX_BYTES = 3_000_000;

/**
 * Homepage screenshot via the Cloudflare Browser Rendering REST screenshot endpoint —
 * same credentials/mode the deep-audit renderer already uses, same SSRF validation as
 * every other engine fetch. Null on any failure; the cover never depends on it.
 */
export async function captureHeroScreenshot(
  env: BrowserRenderEnv,
  url: string,
  deps?: { fetchImpl?: typeof fetch }
): Promise<Uint8Array | null> {
  const config = browserRenderConfigFromEnv(env);
  if (config.mode === 'off' || !hasBrowserRenderingCredentials(config)) return null;

  const validation = await validateEngineFetchUrl(url);
  if (!validation.ok) return null;

  const fetchImpl = deps?.fetchImpl ?? fetch;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId ?? ''}/browser-rendering/screenshot?cacheTTL=3600`;

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiToken ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: validation.safeUrl,
        // Keep this a fixed-viewport capture: the cover reserves exactly 250x156pt for the
        // hero (6pt under the masthead hairline). fullPage:true would produce a taller image
        // and push the frame through the masthead.
        screenshotOptions: { type: 'png' },
        viewport: { width: 1280, height: 800 },
        gotoOptions: { waitUntil: 'networkidle2', timeout: 15_000 },
      }),
      signal: AbortSignal.timeout(SCREENSHOT_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const contentType = response.headers.get('Content-Type') ?? '';
    if (!contentType.includes('image/')) return null;

    const buf = await response.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > SCREENSHOT_MAX_BYTES) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/** Pure assembly of the cover copy — everything in it is a verifiable fact. */
export function buildCoverDesignCopy(input: {
  domain: string;
  checkCount: number;
  generatedDate: string;
}): Omit<CoverDesign, 'heroImage'> {
  return {
    preparedForLines: [`Prepared for the team at ${input.domain}`],
    preparedByLines: [
      'Prepared by the GEO-Pulse team',
      'getgeopulse.com · Montréal, Québec',
      `Generated ${input.generatedDate}`,
    ],
    credibilityLines: [
      `${String(input.checkCount)} checks across retrieval eligibility, AI understanding & trust, and site hygiene`,
      `Crawler registry verified against OpenAI, Anthropic, Perplexity, Google & Bing documentation (${AGENT_REGISTRY_VERSION})`,
      'Scoring weights and methodology published inside this report',
    ],
  };
}

/** Full design build: flag → copy → optional screenshot. Null when the agent is off. */
export async function buildCoverDesign(args: {
  supabase: SupabaseClient;
  env: BrowserRenderEnv;
  domain: string;
  seedUrl: string;
  generatedAt: string;
  scanId: string;
}): Promise<CoverDesign | null> {
  const enabled = await isDesignAgentEnabled(args.supabase);
  if (!enabled) return null;

  const copy = buildCoverDesignCopy({
    domain: args.domain,
    checkCount: CHECK_CATALOG.length,
    // Full date + time (issue #94): the recipient sees exactly when this was produced.
    generatedDate: formatReportTimestamp(args.generatedAt),
  });

  const heroImage = await captureHeroScreenshot(args.env, args.seedUrl);
  structuredLog(
    'report_design_agent',
    { scanId: args.scanId, heroCaptured: Boolean(heroImage) },
    'info'
  );

  return { ...copy, heroImage };
}
