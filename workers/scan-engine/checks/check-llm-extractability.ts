import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';
import type { LLMProvider } from '../../lib/interfaces/providers';

const PROMPT = `You are auditing a web page for "AI Search Readiness".
Judge whether the main textual content appears extractable as standalone facts (clear sentences, lists, definitions) vs mostly marketing fluff or image-only meaning.

Respond with ONLY a single JSON object, no markdown: {"passed": boolean, "reasoning": string, "confidence": "high"|"medium"|"low"}
- passed: true if substantive extractable text; false if thin or non-extractable.`;

export function createExtractabilityCheck(llm: LLMProvider): AuditCheck {
  return {
    id: 'llm-extractability',
    name: 'Content extractability (LLM)',
    weight: 8,
    async run(ctx: CheckContext): Promise<CheckResult> {
      const r = await llm.analyze(PROMPT, ctx.textSample);
      return {
        id: 'llm-extractability',
        passed: r.passed,
        finding: r.reasoning,
        fix: r.passed ? undefined : 'Add concrete facts, definitions, and scannable lists that stand alone without layout.',
      };
    },
  };
}
