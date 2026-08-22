export type BuyerQuestionDefinition = {
  readonly key: string;
  readonly question: string;
  readonly checks: readonly string[];
  readonly summaries: Readonly<Record<'supported' | 'partial' | 'missing', string>>;
  readonly unavailable: string;
};

export const BUYER_INTELLIGENCE_QUESTIONS: readonly BuyerQuestionDefinition[] = [
  {
    key: 'agent_access',
    question: 'Can AI systems access and retrieve the public site?',
    checks: ['ai-crawler-access', 'robots-meta', 'snippet-eligibility', 'https-only'],
    summaries: {
      supported: 'The tested access signals allow public pages to be retrieved.',
      partial: 'Some tested access signals need verification or improvement.',
      missing: 'A tested access control is preventing reliable retrieval.',
    },
    unavailable: 'Public-site access could not be verified in this audit pass.',
  },
  {
    key: 'business_identity_and_proof',
    question: 'Can buyers and agents verify who the business is and what it offers?',
    checks: ['json-ld', 'schema-types', 'eeat-signals', 'external-links'],
    summaries: {
      supported: 'The tested identity and proof signals are explicit and machine-readable.',
      partial: 'The business is identifiable, but some proof or structured context is incomplete.',
      missing: 'Important identity, service, or proof context is not explicit enough to verify.',
    },
    unavailable: 'Business identity and proof could not be verified in this audit pass.',
  },
  {
    key: 'buyer_answer_clarity',
    question: 'Can buyers get direct answers about services and fit?',
    checks: ['llm-qa-pattern', 'llm-extractability', 'information-gain'],
    summaries: {
      supported: 'The tested pages provide direct, extractable answers to buyer questions.',
      partial: 'Relevant answers exist, but clarity or extraction is inconsistent.',
      missing: 'Priority pages do not answer important buyer questions directly enough.',
    },
    unavailable: 'Buyer-answer clarity could not be verified in this audit pass.',
  },
  {
    key: 'priority_page_discovery',
    question: 'Can agents find and understand the priority service pages?',
    checks: ['internal-links', 'canonical', 'title-tag', 'heading-structure'],
    summaries: {
      supported: 'Priority pages have usable discovery and page-structure signals.',
      partial: 'Priority pages are discoverable, but some navigation or structure is incomplete.',
      missing: 'Weak discovery or page structure makes priority services harder to understand.',
    },
    unavailable: 'Priority-page discovery could not be verified in this audit pass.',
  },
  {
    key: 'information_freshness',
    question: 'Is the public business information current enough to trust?',
    checks: ['freshness'],
    summaries: {
      supported: 'The tested pages expose useful freshness and upkeep signals.',
      partial: 'Some freshness signals exist, but important pages need clearer upkeep evidence.',
      missing: 'Important pages do not expose enough evidence that the information is current.',
    },
    unavailable: 'Freshness and upkeep could not be verified in this audit pass.',
  },
];
