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
  { key: 'chatgpt', name: 'OpenAI ChatGPT', file: 'openai.svg', match: ['openai', 'chatgpt', 'oai-searchbot', 'gptbot', 'oai'] },
  { key: 'google', name: 'Google', file: 'google.png', match: ['google', 'gemini', 'ai overview', 'googlebot', 'google-extended'] },
  { key: 'claude', name: 'Anthropic Claude', file: 'claude.svg', match: ['claude', 'anthropic', 'claudebot', 'claude-searchbot'] },
  { key: 'copilot', name: 'Microsoft Bing / Copilot', file: 'copilot.svg', match: ['copilot', 'bing', 'bingbot', 'microsoft'] },
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

/**
 * Landing-hero strip: the official brand logos, rendered at a consistent height on a light panel so
 * dark wordmarks stay visible in both light and dark themes. Logos speak for themselves — no extra
 * text. A caption frames it as nominative ("the engines we check").
 */
export function AiEngineStrip() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 rounded-3xl border border-outline-variant/15 bg-white px-8 py-7 shadow-sm md:gap-x-14 md:px-12 md:py-8">
        {AI_ENGINES.map((engine) => (
          <img
            key={engine.key}
            // eslint-disable-next-line @next/next/no-img-element -- static brand asset
            src={`${LOGO_BASE}/${engine.file}`}
            alt={`${engine.name} logo`}
            className="h-8 w-auto object-contain md:h-11"
            loading="lazy"
            decoding="async"
          />
        ))}
      </div>
      <p className="mt-4 text-center font-body text-sm text-on-surface-variant">
        The AI answer engines we check your visibility across.
      </p>
    </div>
  );
}
