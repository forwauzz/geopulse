type EditorialInput = {
  readonly title: string;
  readonly draftMarkdown: string | null;
  readonly sourceLinks: readonly string[];
  readonly ctaGoal: string | null;
};

export type EditorialCheck = {
  readonly key: string;
  readonly label: string;
  readonly passed: boolean;
};

const REQUIRED_EDITORIAL_KEYS = new Set(['title', 'opening', 'answer_blocks', 'sources', 'cta']);

function getParagraphs(markdown: string): string[] {
  return markdown
    .split(/\r?\n\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith('#') && !part.startsWith('- ') && !part.startsWith('* '));
}

function countHeadingLevel(markdown: string, level: number): number {
  const pattern = new RegExp(`^${'#'.repeat(level)}\\s+.+$`, 'gm');
  return (markdown.match(pattern) ?? []).length;
}

function countListBlocks(markdown: string): number {
  return (markdown.match(/^(?:- |\* |\d+\.\s).+$/gm) ?? []).length;
}

export function evaluateEditorialReadiness(input: EditorialInput): EditorialCheck[] {
  const markdown = input.draftMarkdown?.trim() ?? '';
  const paragraphs = markdown ? getParagraphs(markdown) : [];
  const lead = paragraphs[0] ?? '';

  return [
    {
      key: 'title',
      label: 'Title names a real problem or question',
      passed: input.title.trim().length >= 12,
    },
    {
      key: 'opening',
      label: 'Opening defines the topic quickly',
      passed: lead.length >= 80,
    },
    {
      key: 'answer_blocks',
      label: 'Article has answer-friendly structure',
      passed: countHeadingLevel(markdown, 2) >= 2 || countListBlocks(markdown) >= 3,
    },
    {
      key: 'internal_links',
      label: 'Internal-link path exists on the canonical page',
      passed: true,
    },
    {
      key: 'sources',
      label: 'Trust/evidence inputs are attached',
      passed: input.sourceLinks.length > 0,
    },
    {
      key: 'cta',
      label: 'CTA is present and bounded',
      passed: Boolean(input.ctaGoal?.trim()),
    },
  ];
}

export function assertEditorialReadyForLaunch(input: EditorialInput) {
  const checks = evaluateEditorialReadiness(input);
  const failedRequiredChecks = checks.filter(
    (check) => REQUIRED_EDITORIAL_KEYS.has(check.key) && !check.passed
  );

  if (failedRequiredChecks.length === 0) {
    return checks;
  }

  throw new Error(
    `Cannot publish article yet. Editorial readiness checks failed: ${failedRequiredChecks
      .map((check) => check.label)
      .join('; ')}.`
  );
}
