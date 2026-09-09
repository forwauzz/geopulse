import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

type SeoPlan = {
  readonly seoTitle: string;
  readonly seoHeading: string;
  readonly description: string;
  readonly keywordCluster?: string;
};

const plans: Record<string, SeoPlan> = {
  'seo-ai-visibility-for-managed-service-providers': {
    seoTitle: 'GEO for MSPs: AI Search Visibility Guide',
    seoHeading: 'GEO for MSPs: Improve AI Search Visibility',
    description: 'Learn how MSPs can improve AI search visibility with crawlable service evidence, clear expertise signals, and a repeatable GEO measurement plan.',
  },
  'seo-generative-engine-optimization': {
    seoTitle: 'Generative Search Optimization for MSPs',
    seoHeading: 'Generative Search Optimization for MSPs',
    description: 'A practical guide to generative search optimization for MSPs: make managed IT expertise easier to retrieve, cite, and trust in AI-assisted search.',
  },
  'seo-ai-visibility-audit': {
    seoTitle: 'AI Visibility Audit Checklist: 10 Practical Checks',
    seoHeading: 'AI Visibility Audit Checklist',
    description: 'Use this AI visibility audit checklist to test crawl access, page structure, extractability, trust signals, citations, and repeatable measurement.',
  },
  'seo-msp-audit': {
    seoTitle: 'MSP AI Search Audit: Website Readiness Checklist',
    seoHeading: 'How to Run an MSP AI Search Audit',
    description: 'Use this MSP AI search audit checklist to test crawl access, service-page evidence, local coverage, trust signals, and AI-search measurement.',
  },
  'ai-visibility-priorities-for-agencies': {
    seoTitle: 'AI Visibility Priorities for Agencies',
    seoHeading: 'How Agencies Should Prioritize AI Visibility Work',
    description: 'A practical order of operations for agencies deciding which client website signals, evidence gaps, and AI visibility fixes to address first.',
  },
  'how-agencies-should-operationalize-weekly-readiness-reviews': {
    seoTitle: 'Weekly AI Readiness Reviews for Agencies',
    seoHeading: 'How Agencies Can Run Weekly AI Readiness Reviews',
    description: 'Build a weekly agency review around client website evidence, completed fixes, measured changes, and the next bounded AI visibility action.',
  },
  'single-brand-vs-multi-client-geo-operating-model': {
    seoTitle: 'Single-Brand vs Multi-Client GEO Operations',
    seoHeading: 'Single-Brand vs Multi-Client GEO Operating Models',
    description: 'Compare GEO workflows for one brand and multi-client agencies, including ownership, evidence review, reporting, and measurement cadence.',
  },
  'benchmark-interpretation-checklist-for-teams': {
    seoTitle: 'AI Search Benchmark Interpretation Checklist',
    seoHeading: 'AI Search Benchmark Interpretation Checklist',
    description: 'Use this checklist to interpret AI search benchmarks consistently, separate observations from conclusions, and document limits before acting.',
  },
  'how-to-read-benchmark-runs-without-overclaiming': {
    seoTitle: 'How to Read AI Search Benchmarks Without Overclaiming',
    seoHeading: 'Read AI Search Benchmark Runs Without Overclaiming',
    description: 'Learn how to read an AI search benchmark run, distinguish a measured result from a trend, and avoid unsupported visibility claims.',
  },
  'what-citation-rate-share-of-voice-and-coverage-mean': {
    seoTitle: 'Citation Rate, Share of Voice, and Coverage Explained',
    seoHeading: 'Citation Rate, Share of Voice, and Coverage',
    description: 'Understand what citation rate, AI share of voice, and coverage measure, how their denominators differ, and what each metric cannot prove.',
  },
  'common-readiness-failure-patterns-we-see-first': {
    seoTitle: 'Common AI Search Readiness Failure Patterns',
    seoHeading: 'Common AI Search Readiness Failures to Check First',
    description: 'Review common AI search readiness failures involving crawl access, unclear answers, weak evidence, fragmented structure, and missing context.',
  },
  'what-is-ai-search-readiness-for-b2b-sites': {
    seoTitle: 'What Is AI Search Readiness for B2B Websites?',
    seoHeading: 'What AI Search Readiness Means for B2B Websites',
    description: 'Learn what AI search readiness means for B2B websites and how crawlability, clear service answers, evidence, and structure work together.',
  },
  'crawlable-but-not-extractable': {
    seoTitle: 'Crawlable but Not Extractable: What Teams Miss',
    seoHeading: 'Crawlable but Not Extractable',
    description: 'A page can be reachable yet difficult for AI systems to interpret. Learn how answer structure, context, and evidence improve extractability.',
    keywordCluster: 'crawlability and extractability',
  },
  'long-intro-low-utility-content-pattern': {
    seoTitle: 'Long Introductions and Low-Utility Content',
    seoHeading: 'When Long Introductions Hide the Useful Answer',
    description: 'Learn how long introductions can bury the answer readers and AI systems need, and how to restructure a page around direct, useful evidence.',
  },
  'schema-is-necessary-but-not-sufficient': {
    seoTitle: 'Why Schema Alone Is Not Enough for AI Search',
    seoHeading: 'Schema Is Necessary but Not Sufficient',
    description: 'Structured data helps machines interpret a page, but it cannot replace clear answers, visible evidence, crawl access, and trustworthy content.',
    keywordCluster: 'schema for ai search',
  },
  'schema-present-but-page-still-unclear-pattern': {
    seoTitle: 'Schema Present, Page Unclear: What to Fix',
    seoHeading: 'What to Fix When Schema Is Present but the Page Is Unclear',
    description: 'Use this pattern to diagnose pages that include schema but still lack a direct answer, clear service context, or support for their claims.',
  },
  'seo-generative-engine-optimization-for-msps': {
    seoTitle: 'Generative Engine Optimization for MSPs',
    seoHeading: 'Generative Engine Optimization for MSPs',
    description: 'Learn how MSPs can structure service pages, expertise, and evidence so generative search systems can retrieve and reuse accurate answers.',
  },
  'seo-generative-search-optimization-msp': {
    seoTitle: 'Generative Search Optimization for MSP Websites',
    seoHeading: 'Generative Search Optimization for an MSP Website',
    description: 'A practical workflow for improving an MSP website for generative search through clear services, local context, evidence, and measurement.',
  },
  'seo-managed-service-provider-ai-audit': {
    seoTitle: 'Managed Service Provider AI Audit Guide',
    seoHeading: 'How to Audit an MSP Website for AI Search',
    description: 'Audit an MSP website for crawl access, service clarity, location coverage, proof, trust signals, and repeatable AI search measurement.',
  },
  'seo-msp-seo-and-aeo': {
    seoTitle: 'MSP SEO and AEO: A Practical Guide',
    seoHeading: 'How SEO and AEO Work Together for MSPs',
    description: 'Learn how MSP SEO and answer engine optimization work together across service intent, direct answers, technical access, evidence, and tracking.',
  },
  'seo-msp-websites-ai-search-results-aeo-services': {
    seoTitle: 'How MSP Websites Appear in AI Search Results',
    seoHeading: 'How MSP Websites Can Improve AI Search Results',
    description: 'Learn which MSP website signals help AI search systems understand services, locations, expertise, proof, and the next step for a buyer.',
  },
  'seo-search-engine-optimization-for-msps': {
    seoTitle: 'Search Engine Optimization for MSPs',
    seoHeading: 'Search Engine Optimization for MSPs',
    description: 'A practical MSP SEO guide covering service pages, local intent, technical access, evidence, internal links, and AI search visibility.',
  },
  'ai-search-readiness-audit': {
    seoTitle: 'AI Search Readiness Audit: A Practical Guide',
    seoHeading: 'How to Audit AI Search Readiness',
    description: 'Run an AI search readiness audit across crawl access, page structure, direct answers, machine-readable context, trust, and extractability.',
    keywordCluster: 'ai search readiness audit',
  },
  'product-pages-ai-search': {
    seoTitle: 'Product Pages for AI Search: A Practical Guide',
    seoHeading: 'Build Product Pages That AI Search Can Understand',
    description: 'Improve product pages for AI search with direct answers, precise features, use cases, supporting evidence, structured context, and clear next steps.',
    keywordCluster: 'product page ai search optimization',
  },
  'geo-vs-seo': {
    seoTitle: 'GEO vs SEO: What Changes for AI Search',
    seoHeading: 'GEO vs SEO: What Changes and What Stays Useful',
    description: 'Compare GEO and SEO across discovery, retrieval, citations, rankings, content evidence, and measurement without treating either as a guarantee.',
    keywordCluster: 'geo vs seo',
  },
  'ai-crawlers-robots-txt': {
    seoTitle: 'AI Crawlers and robots.txt: What to Allow',
    seoHeading: 'AI Crawlers and robots.txt',
    description: 'Understand how robots.txt affects AI crawler access, which controls are observable, and how to verify that important public pages stay reachable.',
    keywordCluster: 'ai crawlers robots.txt',
  },
};

const topicSlug = 'topic-msp-websites-ai-search-results-aeo-services';
const topicCopy = {
  topic_page_definition:
    'AI search optimization for MSPs makes managed IT services, locations, expertise, and proof easier for answer engines to retrieve and explain accurately.',
  topic_page_why_it_matters:
    'MSP buyers often ask AI systems for shortlists before visiting a provider website. Clear public evidence improves the chance that those systems understand the offer.',
  topic_page_practical_takeaway:
    'Start with the core MSP guide, audit the highest-intent service pages, fix the clearest evidence gap, and measure the same buyer questions again.',
};

const apply = process.argv.includes('--apply');
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function validatePlan(slug: string, plan: SeoPlan) {
  const renderedTitle = `${plan.seoTitle} | GEO-Pulse`;
  if (renderedTitle.length > 65) throw new Error(`${slug}: title exceeds 65 characters`);
  if (plan.description.length > 155) throw new Error(`${slug}: description exceeds 155 characters`);
}

async function main() {
  for (const [slug, plan] of Object.entries(plans)) validatePlan(slug, plan);
  const targetSlugs = [...Object.keys(plans), topicSlug];
  const { data, error } = await db
    .from('content_items')
    .select('id,slug,metadata,keyword_cluster,updated_at')
    .eq('status', 'published')
    .in('slug', targetSlugs);
  if (error) throw error;
  const rows = data ?? [];
  const found = new Set(rows.map((row) => row.slug));
  const missing = Object.keys(plans).filter((slug) => !found.has(slug));
  if (missing.length) throw new Error(`Missing published targets: ${missing.join(', ')}`);

  const changes = [];
  for (const row of rows) {
    const metadata = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>;
    const plan = plans[row.slug];
    const fields = plan
      ? {
          seo_title: plan.seoTitle,
          seo_h1: plan.seoHeading,
          meta_description: plan.description,
        }
      : topicCopy;
    const keywordCluster = plan?.keywordCluster ?? row.keyword_cluster;
    const fieldChanged = Object.entries(fields).some(([key, value]) => metadata[key] !== value);
    const clusterChanged = keywordCluster !== row.keyword_cluster;
    if (!fieldChanged && !clusterChanged) continue;
    changes.push({
      id: row.id,
      slug: row.slug,
      expectedUpdatedAt: row.updated_at,
      beforeHash: hash({ metadata, keyword_cluster: row.keyword_cluster }),
      before: Object.fromEntries(Object.keys(fields).map((key) => [key, metadata[key] ?? null])),
      after: fields,
      keywordClusterBefore: row.keyword_cluster,
      keywordClusterAfter: keywordCluster,
    });
  }

  const { data: setting, error: settingError } = await db
    .from('automation_settings')
    .select('feature,config,updated_at')
    .eq('feature', 'seo_agent')
    .single();
  if (settingError) throw settingError;
  const currentConfig = (setting.config && typeof setting.config === 'object'
    ? setting.config
    : {}) as Record<string, unknown>;
  const settingChange = currentConfig['content_family_batch'] === 0
    ? null
    : {
        expectedUpdatedAt: setting.updated_at,
        before: currentConfig['content_family_batch'] ?? null,
        after: 0,
      };

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'preview',
    contentChanges: changes,
    automationChange: settingChange,
  }, null, 2));
  if (!apply) return;

  const changedAt = new Date().toISOString();
  for (const change of changes) {
    const row = rows.find((candidate) => candidate.id === change.id)!;
    const metadata = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>;
    const history = Array.isArray(metadata['seo_visibility_history'])
      ? metadata['seo_visibility_history'] as unknown[]
      : [];
    const nextMetadata = {
      ...metadata,
      ...change.after,
      seo_visibility_history: [
        ...history,
        {
          issue: 606,
          changed_at: changedAt,
          before_hash: change.beforeHash,
          reason: 'intent_consolidation_and_unique_public_metadata',
        },
      ].slice(-10),
    };
    const { data: updated, error: updateError } = await db
      .from('content_items')
      .update({
        metadata: nextMetadata,
        keyword_cluster: change.keywordClusterAfter,
        updated_at: changedAt,
      })
      .eq('id', change.id)
      .eq('updated_at', change.expectedUpdatedAt)
      .select('id')
      .maybeSingle();
    if (updateError || !updated) {
      throw new Error(`${change.slug}: compare-and-set update failed`);
    }
  }

  if (settingChange) {
    const nextConfig = {
      ...currentConfig,
      content_family_batch: 0,
      content_family_pause_reason: 'issue_606_consolidate_existing_msp_visibility_pages',
      content_family_pause_at: changedAt,
    };
    const { data: updated, error: updateError } = await db
      .from('automation_settings')
      .update({ config: nextConfig, updated_at: changedAt, updated_by: 'codex:issue-606' })
      .eq('feature', 'seo_agent')
      .eq('updated_at', settingChange.expectedUpdatedAt)
      .select('feature')
      .maybeSingle();
    if (updateError || !updated) throw new Error('seo_agent setting compare-and-set update failed');
  }

  const { data: verified, error: verifyError } = await db
    .from('content_items')
    .select('slug,metadata,keyword_cluster')
    .in('slug', targetSlugs);
  if (verifyError) throw verifyError;
  for (const row of verified ?? []) {
    const metadata = row.metadata as Record<string, unknown>;
    const plan = plans[row.slug];
    const expected = plan
      ? { seo_title: plan.seoTitle, seo_h1: plan.seoHeading, meta_description: plan.description }
      : topicCopy;
    for (const [key, value] of Object.entries(expected)) {
      if (metadata[key] !== value) throw new Error(`${row.slug}: verification failed for ${key}`);
    }
    if (plan?.keywordCluster && row.keyword_cluster !== plan.keywordCluster) {
      throw new Error(`${row.slug}: keyword cluster verification failed`);
    }
  }
  console.log(JSON.stringify({ applied: true, contentRows: changes.length, automationPaused: Boolean(settingChange) }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
