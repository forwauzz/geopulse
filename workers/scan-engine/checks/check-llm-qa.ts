import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';
import type { LLMProvider } from '../../lib/interfaces/providers';

const PROMPT = `You are auditing a web page for "AI Search Readiness".
Determine if the page is primarily structured as a Q&A / FAQ / help article pattern that would be easy for AI systems to cite (clear question-answer pairs or step lists).

Respond with ONLY a single JSON object, no markdown: {"passed": boolean, "reasoning": string, "confidence": "high"|"medium"|"low"}
- passed: true if the page has clear Q&A or instructional Q&A-style structure suitable for extraction; false otherwise.`;

export function createQaPatternCheck(llm: LLMProvider): AuditCheck {
  return {
    id: 'llm-qa-pattern',
    name: 'Q&A / instructional structure (LLM)',
    weight: 10,
    category: 'extractability',
    async run(ctx: CheckContext): Promise<CheckResult> {
      const r = await llm.analyze(PROMPT, ctx.textSample);
      const status = r.confidence === 'low' ? 'LOW_CONFIDENCE' : r.passed ? 'PASS' : 'FAIL';
      return {
        id: 'llm-qa-pattern',
        passed: r.passed,
        status,
        finding: r.reasoning,
        confidence: r.confidence,
        fix: r.passed ? undefined : 'Add clear questions and answers or step-by-step guidance where appropriate.',
      };
    },
  };
}
