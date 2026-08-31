import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getContentPublishIssues } from '../lib/server/content-publishing';
import { createServiceRoleClient } from '../lib/supabase/service-role';

export const AI_VISIBILITY_AUDIT_SLUG = 'seo-ai-visibility-audit';
export const AI_VISIBILITY_AUDIT_CONTENT_ID = 'seo-agent:seo-ai-visibility-audit';
export const EXPECTED_BEFORE_UPDATED_AT = '2026-07-28T01:01:54.310209+00:00';

export const AI_VISIBILITY_AUDIT_TITLE =
  'AI Visibility Audit: A Practical 10-Step Checklist';
export const AI_VISIBILITY_AUDIT_META_DESCRIPTION =
  'Run an AI visibility audit with a practical checklist for crawl access, page structure, extractability, trust signals, and repeatable measurement.';

export const AI_VISIBILITY_AUDIT_SOURCES = [
  'https://developers.google.com/search/docs/appearance/ai-features',
  'https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag',
  'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls',
  'https://help.openai.com/en/articles/12627856-publishers-and-developers-faq',
] as const;

export const AI_VISIBILITY_AUDIT_MARKDOWN = `An AI visibility audit is a repeatable review of two different things: whether your public pages are ready for search and answer systems to access and interpret, and whether your brand actually appears for a fixed set of buyer questions. A useful audit keeps those two evidence sets separate.

> **Direct answer:** Start with crawl access, indexability, canonical URLs, rendered content, heading structure, explicit business facts, supporting evidence, structured data, and internal links. Then test a fixed question set across the answer engines you care about. Record what was observed, what was inferred, who owns each fix, and when the same check will run again.

## What is an AI visibility audit?

An AI visibility audit is a structured diagnosis of the public signals that can affect how a website is discovered, understood, and reused in search or AI-generated answers. It is not one mysterious score and it is not a prediction of where a page will rank.

In this article, AI search readiness means the observable condition of the public website; answer visibility means the separate, dated evidence collected from configured answer tests.

The audit should produce two views:

- **Website readiness:** observable evidence on your own pages, such as response status, robots directives, canonical tags, rendered copy, headings, structured data, authorship, business identity, and internal links.
- **Observed answer visibility:** dated captures of whether a brand, page, or competitor appeared for the same defined buyer questions in the same configured engines.

Google's [guidance for AI features and websites](https://developers.google.com/search/docs/appearance/ai-features) says the normal technical and content foundations for Search still apply; there is no special AI-only schema or file required. OpenAI separately documents crawler controls in its [publishers and developers FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq). Those controls help define access. They do not establish that a page will be selected for an answer.

## What should an AI visibility audit check?

A practical audit should cover the smallest set of checks that can change a decision.

### 1. Crawl access and indexability

Confirm that the important URL returns a useful response, is not blocked by an unintended robots rule, and does not carry an accidental noindex directive. Google's [robots meta tag documentation](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag) is the source of truth for how Google interprets page-level indexing controls.

### 2. Canonical and URL consistency

Check that the page has one stable, self-consistent public URL. Internal links, XML sitemaps, redirects, and canonical tags should not send conflicting signals. Google's [canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) explains how canonical signals are used to choose a representative URL; a canonical is a signal, not a ranking guarantee.

### 3. Rendered answer clarity

Inspect the page a crawler actually receives. The main topic and answer should not depend on a failed script or an interaction. The page should have one descriptive H1, useful H2 sections, short answer blocks, and language that is specific enough to quote without guessing.

### 4. Entity and trust context

Verify that the page identifies the business, product, author or responsible organization, relevant dates, and evidence behind material claims. Structured data should match visible content. It should clarify the page, not add claims that a reader cannot verify.

### 5. Internal topic relationships

Important pages should link to the product, methodology, and supporting explanations that help a reader understand the topic. For this subject, compare the [GEO-Pulse audit methodology](/methodology/ai-search-readiness-audit) with the broader [AI-search readiness audit guide](/blog/ai-search-readiness-audit).

### 6. Repeatable answer observations

If the goal includes actual answer visibility, define the buyer questions, engines, geography, and schedule before collecting results. Preserve the prompt, response, cited sources, model or provider version when available, and collection time. A screenshot without that context is an anecdote, not a baseline.

## How do you run the audit? Use this 10-step checklist

1. **Choose the decision and audience.** State who is searching, what they need to decide, and which market or service line matters.
2. **Select the high-intent pages.** Start with the homepage, product or service page, pricing page, comparison page, and the content already receiving qualified impressions.
3. **Verify HTTP access.** Record status codes, redirect chains, robots rules, noindex directives, and any WAF or rendering failure.
4. **Resolve the canonical URL.** Compare the live canonical, sitemap URL, internal links, and redirected variants. Fix contradictions instead of creating duplicate pages.
5. **Read the rendered page.** Confirm that the primary answer, offer, business identity, and navigation are present in the delivered experience.
6. **Inspect the information structure.** Check the H1, H2 sequence, direct-answer blocks, lists, tables, definitions, and whether each section answers one clear question.
7. **Verify claims and trust signals.** Match product claims to visible evidence, identify authorship, cite authoritative sources, and remove unsupported performance promises.
8. **Check machine-readable context.** Review structured data, metadata, canonical tags, entity names, dates, and internal links against the visible page.
9. **Measure answer visibility separately.** Run the same approved question set in the same engines and record mentions, citations, competitors, and missing evidence without rewriting failed observations.
10. **Prioritize and remeasure.** Give every issue an owner, severity, confidence level, next action, and due date. Re-run the same checks after the change ships.

## What should the audit report contain?

The report should make the handoff obvious. Each finding needs enough context for a developer, SEO operator, content owner, or founder to act without decoding a generic recommendation.

| Field | What to record |
| --- | --- |
| Check | The exact signal, page, or buyer question reviewed |
| Observation | What the audit retrieved or rendered |
| Evidence | The URL, response detail, source, or dated answer capture |
| Interpretation | Why the observation matters, clearly labeled as interpretation |
| Confidence | High, medium, low, or blocked, with the reason |
| Owner | The person or function responsible for the next step |
| Next action | One bounded fix or verification step |
| Remeasurement | The date and identical check used to confirm the change |

Avoid a report that collapses everything into a single score. A score can summarize, but the evidence and next action are what make the audit useful.

## Worked example: audit this article without inventing a result

This page provides a reproducible page-level example. Verify the live URL rather than trusting this checklist blindly:

- the canonical should resolve to \`/blog/seo-ai-visibility-audit\` on \`getgeopulse.com\`;
- the page template should render one H1 and the article sections as H2s;
- the meta description should explain the checklist, not expose an internal rank or competitor note;
- the product CTA should stay on the GEO-Pulse domain;
- the public sources should be the official documents cited in the relevant sections;
- the structured Article description should match the public metadata and visible lead.

Passing those checks establishes that the article is technically coherent and easier to interpret. It does not prove that an answer engine will cite it or that Google will rank it first.

## What can an AI visibility audit not prove?

An audit cannot guarantee a ranking, citation, traffic level, recommendation, or revenue outcome. It also cannot infer stable market-wide performance from one prompt, one engine, or one day of observations.

Be especially careful with these shortcuts:

- treating crawl access as proof of inclusion;
- treating structured data as a ranking switch;
- treating one model response as a durable rank;
- treating a readiness score as measured buyer demand;
- changing the prompt or engine between baseline and remeasurement;
- reporting an unsupported explanation as an observed fact.

The honest outcome is a prioritized evidence baseline: what is accessible, what is clear, what is missing, what was observed in configured answer tests, and what should be verified next.

## How should you prioritize fixes?

Fix failures in this order:

1. access, response, rendering, or accidental noindex blockers;
2. conflicting canonical, redirect, sitemap, and internal-link signals;
3. unclear offer, weak answer structure, or missing business identity;
4. unsupported claims and missing source context;
5. structured data that does not match the visible page;
6. broader content and authority work informed by repeated buyer-question evidence.

That order prevents a team from polishing a page that cannot be retrieved or publishing more content before it understands the existing gap.

## Run a free AI visibility audit

[Run the free AI visibility audit](/ai-visibility-audit) on a public URL. GEO-Pulse checks observable crawl, structure, extractability, machine-readable context, and trust signals, then gives you a practical place to start. Use ongoing answer monitoring separately when you need repeatable evidence about brand mentions or citations.

## Sources used

- [Google Search: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Google Search: robots meta tags and data attributes](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [Google Search: canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [OpenAI: publishers and developers FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq)
`;

type ContentRow = {
  readonly id: string;
  readonly content_id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: string;
  readonly content_type: string;
  readonly topic_cluster: string | null;
  readonly cta_goal: string;
  readonly source_type: string;
  readonly source_links: string[];
  readonly draft_markdown: string;
  readonly canonical_url: string | null;
  readonly metadata: Record<string, unknown>;
  readonly published_at: string | null;
  readonly updated_at: string;
};

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildAiVisibilityAuditRepair(row: ContentRow, now: string) {
  const beforeFingerprint = fingerprint({
    title: row.title,
    draft_markdown: row.draft_markdown,
    source_links: row.source_links,
    metadata: row.metadata,
    updated_at: row.updated_at,
  });
  const previousHistory = Array.isArray(row.metadata['repair_history'])
    ? row.metadata['repair_history']
    : [];
  const metadata = {
    ...row.metadata,
    author_name: 'Uzziel T.',
    author_role: 'Founder, GEO-Pulse',
    author_url: 'https://getgeopulse.com/about',
    meta_description: AI_VISIBILITY_AUDIT_META_DESCRIPTION,
    editorial_retry_required: false,
    requires_source_backed_editorial_review: false,
    repair_history: [
      ...previousHistory,
      {
        issue: 587,
        applied_at: now,
        previous_updated_at: row.updated_at,
        previous_content_sha256: beforeFingerprint,
        reasons: [
          'internal_search_note_exposed',
          'lookalike_domain_links',
          'unsupported_outcome_claims',
          'thin_search_intent_coverage',
          'heading_semantics',
        ],
      },
    ],
  };
  const payload = {
    title: AI_VISIBILITY_AUDIT_TITLE,
    target_persona: 'seo_consultants_and_agency_owners',
    primary_problem:
      'Teams need a repeatable way to separate page-readiness issues from observed AI answer visibility.',
    brief_markdown: `## Reader and decision\n\nSEO consultants and agency owners need a repeatable AI visibility audit they can run, explain, and remeasure.\n\n## Proof boundary\n\nSeparate observable website readiness from dated answer-engine observations. Do not promise rankings, citations, traffic, or revenue.\n\n## Primary CTA\n\nRun the free AI visibility audit.`,
    draft_markdown: AI_VISIBILITY_AUDIT_MARKDOWN,
    source_type: 'internal_plus_research',
    source_links: [...AI_VISIBILITY_AUDIT_SOURCES],
    canonical_url: '/blog/seo-ai-visibility-audit',
    metadata,
  };
  const publishIssues = getContentPublishIssues({
    ...row,
    ...payload,
    source_links: payload.source_links,
    updated_at: now,
  });
  return {
    beforeFingerprint,
    afterFingerprint: fingerprint(payload),
    payload,
    publishIssues,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']?.trim();
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY']?.trim();
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase service-role environment.');

  const db = createServiceRoleClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await db
    .from('content_items')
    .select('*')
    .eq('content_id', AI_VISIBILITY_AUDIT_CONTENT_ID)
    .eq('slug', AI_VISIBILITY_AUDIT_SLUG)
    .single();
  if (error || !data) throw error ?? new Error('Target content row was not found.');

  const row = data as ContentRow;
  const alreadyApplied =
    row.title === AI_VISIBILITY_AUDIT_TITLE &&
    row.metadata?.['meta_description'] === AI_VISIBILITY_AUDIT_META_DESCRIPTION &&
    row.draft_markdown === AI_VISIBILITY_AUDIT_MARKDOWN;
  const repair = buildAiVisibilityAuditRepair(row, new Date().toISOString());
  if (repair.publishIssues.length > 0) {
    throw new Error(`Repair candidate failed publish checks: ${repair.publishIssues.join(' | ')}`);
  }

  if (alreadyApplied) {
    console.log(JSON.stringify({ status: 'already_applied', updatedAt: row.updated_at }, null, 2));
    return;
  }
  if (row.updated_at !== EXPECTED_BEFORE_UPDATED_AT) {
    throw new Error(
      `Compare-and-set refused: expected updated_at ${EXPECTED_BEFORE_UPDATED_AT}, received ${row.updated_at}.`
    );
  }

  console.log(
    JSON.stringify(
      {
        status: apply ? 'apply_requested' : 'preview',
        target: { id: row.id, contentId: row.content_id, slug: row.slug },
        before: {
          updatedAt: row.updated_at,
          title: row.title,
          sourceLinks: row.source_links,
          fingerprint: repair.beforeFingerprint,
        },
        after: {
          title: repair.payload.title,
          sourceLinks: repair.payload.source_links,
          fingerprint: repair.afterFingerprint,
        },
        publishIssues: repair.publishIssues,
      },
      null,
      2
    )
  );
  if (!apply) return;

  const { data: updated, error: updateError } = await db
    .from('content_items')
    .update(repair.payload)
    .eq('id', row.id)
    .eq('content_id', AI_VISIBILITY_AUDIT_CONTENT_ID)
    .eq('slug', AI_VISIBILITY_AUDIT_SLUG)
    .eq('updated_at', EXPECTED_BEFORE_UPDATED_AT)
    .select('id,content_id,slug,title,updated_at,metadata')
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new Error('Compare-and-set update affected no row.');

  const { error: logError } = await db.from('app_logs').insert({
    level: 'info',
    event: 'public_content_repair_applied',
    data: {
      issue: 587,
      content_id: AI_VISIBILITY_AUDIT_CONTENT_ID,
      slug: AI_VISIBILITY_AUDIT_SLUG,
      before_sha256: repair.beforeFingerprint,
      after_sha256: repair.afterFingerprint,
      previous_updated_at: EXPECTED_BEFORE_UPDATED_AT,
      updated_at: String(updated.updated_at),
    },
  });
  if (logError) throw logError;

  console.log(
    JSON.stringify(
      {
        status: 'applied',
        id: updated.id,
        contentId: updated.content_id,
        slug: updated.slug,
        title: updated.title,
        updatedAt: updated.updated_at,
      },
      null,
      2
    )
  );
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]!).href;
if (isDirectExecution) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
