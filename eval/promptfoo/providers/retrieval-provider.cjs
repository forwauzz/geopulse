const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has',
  'have', 'how', 'if', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the',
  'their', 'this', 'to', 'was', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'your',
]);

function normalizeWhitespace(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function tokenize(text) {
  return normalizeWhitespace(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function uniqueTokens(text) {
  return new Set(tokenize(text));
}

function lexicalOverlapScore(prompt, passage) {
  const promptTokens = uniqueTokens(prompt);
  const passageTokens = uniqueTokens(passage);
  if (promptTokens.size === 0 || passageTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of promptTokens) {
    if (passageTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / promptTokens.size;
}

function parseDocuments(rawDocuments) {
  return String(rawDocuments ?? '')
    .split(/\n---\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const urlMatch = block.match(/URL:\s*(.+)/i);
      const textMatch = block.match(/TEXT:\s*([\s\S]+)/i);
      return {
        url: normalizeWhitespace(urlMatch?.[1] ?? ''),
        text: normalizeWhitespace(textMatch?.[1] ?? ''),
      };
    })
    .filter((doc) => doc.url && doc.text);
}

class RetrievalProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'geopulse-retrieval-provider';
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    const question = String(prompt ?? '');
    const docs = parseDocuments(context?.vars?.documents);
    const expectedSource = String(context?.vars?.expected_source ?? '');
    const expectedFact = String(context?.vars?.expected_fact ?? '');

    const ranked = docs
      .map((doc) => ({
        ...doc,
        score: lexicalOverlapScore(question, doc.text),
      }))
      .filter((doc) => doc.score > 0)
      .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
      .slice(0, 2);

    const answer = ranked.map((doc) => doc.text).join(' ');
    const citations = ranked.map((doc) => doc.url);
    const output = {
      answer,
      citations,
      retrievedExpectedPage: expectedSource ? citations.includes(expectedSource) : false,
      answerMentionsExpectedFact: expectedFact
        ? answer.toLowerCase().includes(expectedFact.toLowerCase())
        : false,
      citationCount: citations.length,
      unsupportedClaimCount:
        answer.trim().length > 0 && expectedFact && !answer.toLowerCase().includes(expectedFact.toLowerCase()) ? 1 : 0,
    };

    return {
      output: JSON.stringify(output),
    };
  }
}

module.exports = RetrievalProvider;
