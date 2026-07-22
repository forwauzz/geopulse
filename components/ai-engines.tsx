/**
 * Canonical AI-engine registry — the single source of truth for which answer engines GEO-Pulse
 * checks, and how their brand marks render across the app (landing strip, results Access Matrix,
 * report, emails).
 *
 * Logos are OFFICIAL brand assets the operator drops into /public/media/logos (see the README
 * there). We never inline reproductions — `EngineLogo` references the committed files, and every
 * usage pairs the mark with the engine's wordmark so it degrades to text if an asset is missing.
 * Using these marks to show "here is where we check your visibility" is nominative use.
 */

export type AiEngineKey = 'chatgpt' | 'google' | 'claude' | 'copilot' | 'perplexity';

export interface AiEngine {
  readonly key: AiEngineKey;
  /** Display wordmark. */
  readonly name: string;
  /** Filename under /public/media/logos (operator-provided official asset). */
  readonly file: string;
  /** Substrings (lowercased) that map a scan destination/label to this engine. */
  readonly match: readonly string[];
}

/** The engines we surface, in display order. Named to match the buyer's mental model. */
export const AI_ENGINES: readonly AiEngine[] = [
  { key: 'chatgpt', name: 'ChatGPT', file: 'openai.svg', match: ['openai', 'chatgpt', 'oai-searchbot', 'gptbot', 'oai'] },
  { key: 'google', name: 'Google', file: 'google.svg', match: ['google', 'gemini', 'ai overview', 'googlebot', 'google-extended'] },
  { key: 'claude', name: 'Claude', file: 'claude.svg', match: ['claude', 'anthropic', 'claudebot', 'claude-searchbot'] },
  { key: 'copilot', name: 'Copilot', file: 'copilot.svg', match: ['copilot', 'bing', 'bingbot', 'microsoft'] },
  { key: 'perplexity', name: 'Perplexity', file: 'perplexity.svg', match: ['perplexity', 'perplexitybot'] },
] as const;

const LOGO_BASE = '/media/logos';

/** Absolute logo URL (for emails / OG), given the app base url. */
export function engineLogoUrl(engine: AiEngine, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}${LOGO_BASE}/${engine.file}`;
}

/** Best-effort map from a scan destination string or label to a known engine. */
export function engineForLabel(label: string | null | undefined): AiEngine | null {
  if (!label) return null;
  const l = label.toLowerCase();
  for (const engine of AI_ENGINES) {
    if (engine.match.some((m) => l.includes(m))) return engine;
  }
  return null;
}

export function EngineLogo({
  engine,
  className = 'h-6 w-6',
}: {
  engine: AiEngine;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand asset, no optimization needed
    <img
      src={`${LOGO_BASE}/${engine.file}`}
      alt={`${engine.name} logo`}
      className={`${className} object-contain`}
      loading="lazy"
      decoding="async"
    />
  );
}

/** Landing-hero strip: official mark + wordmark for each engine (wordmark keeps it legible if an
 *  asset is missing). */
export function AiEngineStrip() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
      {AI_ENGINES.map((engine) => (
        <span key={engine.key} className="inline-flex items-center gap-2 opacity-90 transition hover:opacity-100">
          <EngineLogo engine={engine} className="h-6 w-6" />
          <span className="font-sans text-sm font-bold tracking-tight text-on-background">{engine.name}</span>
        </span>
      ))}
    </div>
  );
}
