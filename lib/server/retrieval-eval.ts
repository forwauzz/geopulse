export type RetrievalEvalPage = {
  readonly url: string;
  readonly section?: string | null;
  readonly content: string;
};

export type RetrievalEvalPrompt = {
  readonly promptKey: string;
  readonly promptText: string;
  readonly expectedSources?: readonly string[];
  readonly expectedFacts?: readonly string[];
};

export type RetrievalPassage = {
  readonly pageUrl: string;
  readonly section: string | null;
  readonly passageText: string;
  readonly rank: number;
  readonly score: number;
};

export type RetrievalEvalResult = {
  readonly promptKey: string;
  readonly promptText: string;
  readonly passages: readonly RetrievalPassage[];
  readonly metrics: {
    readonly retrievedExpectedPage: boolean;
    readonly answerHasExpectedSource: boolean;
    readonly answerMentionsExpectedFact: boolean;
    readonly citationCount: number;
    readonly unsupportedClaimCount: number;
  };
  readonly answerText: string;
};

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has',
  'have', 'how', 'if', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the',
  'their', 'this', 'to', 'was', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'your',
]);

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function tokenize(text: string): string[] {
  return normalizeWhitespace(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function uniqueTokens(text: string): Set<string> {
  return new Set(tokenize(text));
}

export function buildPassagesFromPages(
  pages: readonly RetrievalEvalPage[],
  options?: { maxPassageChars?: number }
): RetrievalPassage[] {
  const maxPassageChars = options?.maxPassageChars ?? 280;
  const passages: RetrievalPassage[] = [];

  for (const page of pages) {
    const chunks = normalizeWhitespace(page.content)
      .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((chunk) => normalizeWhitespace(chunk))
      .filter((chunk) => chunk.length >= 40);

    const useChunks = chunks.length > 0 ? chunks : [normalizeWhitespace(page.content)];
    for (const chunk of useChunks) {
      passages.push({
        pageUrl: page.url,
        section: page.section ?? null,
        passageText: chunk.slice(0, maxPassageChars),
        rank: 0,
        score: 0,
      });
    }
  }

  return passages;
}

function lexicalOverlapScore(prompt: string, passage: string): number {
  const promptTokens = uniqueTokens(prompt);
  const passageTokens = uniqueTokens(passage);
  if (promptTokens.size === 0 || passageTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of promptTokens) {
    if (passageTokens.has(token)) overlap += 1;
  }
  return overlap / promptTokens.size;
}

function buildAnswerText(passages: readonly RetrievalPassage[]): string {
  return passages
    .slice(0, 2)
    .map((p) => p.passageText)
    .join(' ');
}

function includesAny(text: string, candidates: readonly string[] | undefined): boolean {
  if (!candidates || candidates.length === 0) return false;
  const lower = text.toLowerCase();
  return candidates.some((candidate) => lower.includes(candidate.toLowerCase()));
}

export function simulateRetrievalForPrompt(
  pages: readonly RetrievalEvalPage[],
  prompt: RetrievalEvalPrompt,
  options?: { topK?: number; maxPassageChars?: number }
): RetrievalEvalResult {
  const topK = options?.topK ?? 3;
  const ranked = buildPassagesFromPages(pages, { maxPassageChars: options?.maxPassageChars })
    .map((passage) => ({
      ...passage,
      score: lexicalOverlapScore(prompt.promptText, passage.passageText),
    }))
    .filter((passage) => passage.score > 0)
    .sort((a, b) => b.score - a.score || a.pageUrl.localeCompare(b.pageUrl))
    .slice(0, topK)
    .map((passage, index) => ({ ...passage, rank: index + 1 }));

  const answerText = buildAnswerText(ranked);
  const retrievedExpectedPage = (prompt.expectedSources ?? []).some((source) =>
    ranked.some((passage) => passage.pageUrl === source)
  );
  const answerHasExpectedSource = includesAny(
    ranked.map((passage) => passage.pageUrl).join(' '),
    prompt.expectedSources
  );
  const answerMentionsExpectedFact = includesAny(answerText, prompt.expectedFacts);

  return {
    promptKey: prompt.promptKey,
    promptText: prompt.promptText,
    passages: ranked,
    metrics: {
      retrievedExpectedPage,
      answerHasExpectedSource,
      answerMentionsExpectedFact,
      citationCount: ranked.length,
      unsupportedClaimCount: answerText.trim().length > 0 && !answerMentionsExpectedFact ? 1 : 0,
    },
    answerText,
  };
}
