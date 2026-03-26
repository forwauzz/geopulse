import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { requireAdminOrRedirect } from '@/lib/server/require-admin';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

type RetrievalRun = {
  id: string;
  framework: string | null;
  domain: string | null;
  site_url: string | null;
  prompt_set_name: string;
  rubric_version: string;
  generator_version: string;
  overall_score: number | null;
  metrics: Record<string, unknown> | null;
  created_at: string;
  notes: string | null;
};

type PromptRow = {
  id: string;
  prompt_key: string;
  prompt_text: string;
  expected_sources: string[] | null;
  expected_facts: string[] | null;
};

type PassageRow = {
  id: string;
  prompt_id: string | null;
  source_url: string | null;
  section_label: string | null;
  passage_text: string;
  rank: number | null;
  metadata: Record<string, unknown> | null;
};

type AnswerRow = {
  id: string;
  prompt_id: string;
  answer_text: string;
  cited_sources: string[] | null;
  metrics: Record<string, unknown> | null;
};

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatFramework(value: string | null): string {
  if (!value) return 'Unknown';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toPercent(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '\u2014';
  return `${Math.round(value * 100)}%`;
}

function toCount(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '\u2014';
  return String(value);
}

export default async function RetrievalEvalDetailPage({ params }: Props) {
  const { id } = await params;
  const supabaseSession = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabaseSession.auth.getUser();

  if (!user) {
    redirect(`/login?next=/dashboard/evals/retrieval/${id}`);
  }

  requireAdminOrRedirect(user.email);

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">Server misconfigured: missing Supabase service role.</p>
      </main>
    );
  }

  const adminDb = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const [{ data: run, error: runError }, { data: prompts, error: promptsError }, { data: passages, error: passagesError }, { data: answers, error: answersError }] =
    await Promise.all([
      adminDb
        .from('retrieval_eval_runs')
        .select(
          'id,framework,domain,site_url,prompt_set_name,rubric_version,generator_version,overall_score,metrics,created_at,notes'
        )
        .eq('id', id)
        .maybeSingle(),
      adminDb
        .from('retrieval_eval_prompts')
        .select('id,prompt_key,prompt_text,expected_sources,expected_facts')
        .eq('run_id', id)
        .order('created_at', { ascending: true }),
      adminDb
        .from('retrieval_eval_passages')
        .select('id,prompt_id,source_url,section_label,passage_text,rank,metadata')
        .eq('run_id', id)
        .order('rank', { ascending: true }),
      adminDb
        .from('retrieval_eval_answers')
        .select('id,prompt_id,answer_text,cited_sources,metrics')
        .eq('run_id', id)
        .order('created_at', { ascending: true }),
    ]);

  if (runError || promptsError || passagesError || answersError || !run) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">Could not load retrieval eval detail.</p>
      </main>
    );
  }

  const promptList = (prompts ?? []) as PromptRow[];
  const passageList = (passages ?? []) as PassageRow[];
  const answerList = (answers ?? []) as AnswerRow[];
  const runRow = run as RetrievalRun;

  const promptMap = new Map(promptList.map((prompt) => [prompt.id, prompt]));
  const answerMap = new Map(answerList.map((answer) => [answer.prompt_id, answer]));

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">Admin</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Retrieval eval detail</h1>
          <p className="mt-2 font-body text-sm text-on-surface-variant">
            {runRow.domain ?? 'unknown site'} · {formatFramework(runRow.framework)} · {runRow.prompt_set_name}
          </p>
          <p className="mt-1 font-body text-sm text-on-surface-variant">{formatTs(runRow.created_at)}</p>
        </div>
        <Link
          href="/dashboard/evals"
          className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
        >
          Back to eval analytics
        </Link>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Overall score</p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {runRow.overall_score != null ? `${runRow.overall_score}/100` : '\u2014'}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Expected page rate</p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {toPercent(runRow.metrics?.['retrieved_expected_page_rate'])}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Expected fact rate</p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {toPercent(runRow.metrics?.['answer_mentions_expected_fact_rate'])}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Unsupported claims</p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {toCount(runRow.metrics?.['unsupported_claim_total'])}
          </p>
        </div>
      </section>

      <section className="mt-8 rounded-xl bg-surface-container-lowest p-6 shadow-float">
        <h2 className="font-headline text-lg font-semibold text-on-background">Run metadata</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Site URL</p>
            <p className="mt-1 text-sm text-on-background">{runRow.site_url ?? '\u2014'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Generator</p>
            <p className="mt-1 text-sm text-on-background">{runRow.generator_version}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Rubric</p>
            <p className="mt-1 text-sm text-on-background">{runRow.rubric_version}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Notes</p>
            <p className="mt-1 text-sm text-on-background">{runRow.notes ?? '\u2014'}</p>
          </div>
        </div>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="font-headline text-lg font-semibold text-on-background">Prompt drilldown</h2>
        {promptList.length === 0 ? (
          <div className="rounded-xl bg-surface-container-lowest p-6 text-sm text-on-surface-variant shadow-float">
            No prompt rows were found for this run.
          </div>
        ) : (
          promptList.map((prompt) => {
            const promptPassages = passageList.filter((passage) => passage.prompt_id === prompt.id);
            const answer = answerMap.get(prompt.id) ?? null;
            return (
              <article key={prompt.id} className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-primary">{prompt.prompt_key}</p>
                    <h3 className="mt-2 font-headline text-xl font-semibold text-on-background">{prompt.prompt_text}</h3>
                  </div>
                  <div className="text-sm text-on-surface-variant">
                    {answer ? (
                      <div>
                        citations: {Array.isArray(answer.cited_sources) ? answer.cited_sources.length : 0}
                      </div>
                    ) : (
                      <div>No answer row</div>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-on-surface-variant">Expected sources</p>
                    <p className="mt-1 text-sm text-on-background">
                      {prompt.expected_sources?.join(', ') || '\u2014'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-on-surface-variant">Expected facts</p>
                    <p className="mt-1 text-sm text-on-background">
                      {prompt.expected_facts?.join(', ') || '\u2014'}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div>
                    <h4 className="font-semibold text-on-background">Answer</h4>
                    <div className="mt-3 rounded-xl bg-surface-container-low p-4 text-sm text-on-background">
                      {answer?.answer_text || 'No answer text stored.'}
                    </div>
                    <div className="mt-3 text-xs text-on-surface-variant">
                      Retrieved expected page: {String(answer?.metrics?.['retrievedExpectedPage'] ?? '\u2014')} ·
                      Mentions expected fact: {String(answer?.metrics?.['answerMentionsExpectedFact'] ?? '\u2014')} ·
                      Unsupported claims: {String(answer?.metrics?.['unsupportedClaimCount'] ?? '\u2014')}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-on-background">Selected passages</h4>
                    <div className="mt-3 space-y-3">
                      {promptPassages.length === 0 ? (
                        <div className="rounded-xl bg-surface-container-low p-4 text-sm text-on-surface-variant">
                          No passages stored for this prompt.
                        </div>
                      ) : (
                        promptPassages.map((passage) => (
                          <div key={passage.id} className="rounded-xl bg-surface-container-low p-4">
                            <div className="flex items-center justify-between gap-3 text-xs text-on-surface-variant">
                              <span>{passage.source_url ?? promptMap.get(prompt.id)?.prompt_key}</span>
                              <span>
                                rank {passage.rank ?? '\u2014'} · score {String(passage.metadata?.['score'] ?? '\u2014')}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-on-background">{passage.passage_text}</p>
                            {passage.section_label ? (
                              <p className="mt-2 text-xs uppercase tracking-widest text-on-surface-variant">
                                {passage.section_label}
                              </p>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
