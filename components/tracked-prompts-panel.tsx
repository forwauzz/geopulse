import { addTrackedPromptAction } from '@/app/dashboard/prompt-actions';
import type { EngineKey } from '@/lib/server/dashboard-citation-metrics';
import { MAX_CUSTOM_PROMPTS, type TrackedPromptPanel } from '@/lib/server/tracked-prompts';

const ENGINE_LABEL: Record<EngineKey, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  claude: 'Claude',
};

function promptStatusMessage(code: string | undefined): string | null {
  switch (code) {
    case 'added':
      return 'Prompt added — it runs with tonight’s sweep.';
    case 'limit':
      return `You’ve reached the ${MAX_CUSTOM_PROMPTS}-prompt limit for custom prompts.`;
    case 'invalid':
      return 'Write the prompt as a full question (at least a few words).';
    case 'no_domain':
      return 'Run an audit first — prompts track the domain of your latest audit.';
    case 'not_tracked':
      return 'This domain is not in citation tracking yet.';
    case 'error':
      return 'Could not save that prompt. Try again.';
    default:
      return null;
  }
}

/**
 * "The questions we ask the engines about you" — per prompt, whether each engine cited the domain
 * in its latest BLIND answer (the target is never named in the prompt, so a ✓ is real visibility).
 */
export function TrackedPromptsPanel(props: {
  readonly panel: TrackedPromptPanel;
  readonly domain: string;
  readonly statusCode?: string;
}) {
  const { panel, domain } = props;
  if (!panel.tracked) return null;

  const statusMessage = promptStatusMessage(props.statusCode);

  return (
    <article
      data-testid="tracked-prompts-panel"
      className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-headline text-base font-semibold text-on-background">
            The questions we ask the AI engines about {domain}
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
            Every night we ask each engine these buyer questions — without ever mentioning {domain} — and
            check whether it names you anyway. Add the questions your customers actually ask.
          </p>
        </div>
        {statusMessage ? (
          <p className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-xs text-on-surface">
            {statusMessage}
          </p>
        ) : null}
      </div>

      {panel.prompts.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[540px] text-left text-sm">
            <thead>
              <tr className="border-b border-outline-variant/20 text-[11px] uppercase tracking-widest text-on-surface-variant">
                <th className="py-2 pr-3 font-semibold">Prompt</th>
                {panel.engineOrder.map((engine) => (
                  <th key={engine} className="w-24 py-2 pr-3 text-center font-semibold">
                    {ENGINE_LABEL[engine]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/15">
              {panel.prompts.map((prompt) => (
                <tr key={prompt.queryText}>
                  <td className="py-2.5 pr-3 text-on-background">
                    {prompt.queryText}
                    {prompt.source === 'yours' ? (
                      <span className="ml-2 rounded bg-tertiary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-tertiary">
                        yours
                      </span>
                    ) : null}
                  </td>
                  {panel.engineOrder.map((engine) => {
                    const cited = prompt.engines[engine];
                    return (
                      <td key={engine} className="py-2.5 pr-3 text-center">
                        {cited === null || cited === undefined ? (
                          <span className="text-xs text-on-surface-variant">queued</span>
                        ) : cited ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-500/15 dark:text-green-200">
                            <span className="material-symbols-outlined text-[13px]" aria-hidden>check</span>
                            Cited
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-error/15 px-2 py-0.5 text-xs font-semibold text-error">
                            <span className="material-symbols-outlined text-[13px]" aria-hidden>close</span>
                            Not cited
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-on-surface-variant">
          First results land with tonight’s sweep.
        </p>
      )}

      <form action={addTrackedPromptAction} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          name="promptText"
          maxLength={240}
          placeholder='e.g. "Who is the best IT provider for a dental clinic in Montreal?"'
          className="min-h-[42px] flex-1 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-tertiary/30"
        />
        <button
          type="submit"
          className="min-h-[42px] shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary transition hover:opacity-90"
        >
          Track this prompt
        </button>
      </form>
      <p className="mt-2 text-[11px] text-on-surface-variant">
        Up to {MAX_CUSTOM_PROMPTS} custom prompts ({panel.customPromptCount} used). New prompts show as
        “queued” until the next nightly run.
      </p>
    </article>
  );
}
