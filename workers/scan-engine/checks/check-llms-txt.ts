/**
 * llms.txt — weight 0, hygiene bucket (spec §2.5/C7).
 *
 * No major engine honors llms.txt as a citation signal (Google states it does nothing
 * for Search; near-zero real fetches observed industry-wide). It is offered as an
 * optional experiment: absence never penalizes, presence never promises a benefit.
 */
import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

export const llmsTxtCheck: AuditCheck = {
  id: 'llms-txt',
  name: 'llms.txt (optional experiment)',
  weight: 0,
  category: 'ai_readiness',
  run(ctx: CheckContext): CheckResult {
    const content = ctx.llmsTxtContent;
    if (content && content.trim().length > 0) {
      return {
        id: 'llms-txt',
        passed: true,
        status: 'PASS',
        finding: `llms.txt found (${String(content.trim().length)} chars). Treat it as an optional experiment — no major AI engine uses it as a citation signal today, so expect no measurable benefit from it.`,
      };
    }

    return {
      id: 'llms-txt',
      passed: true,
      status: 'PASS',
      finding:
        'No /llms.txt file — and that is fine. No major AI engine honors llms.txt today, so it carries no score weight. Publish one only if you want to experiment.',
    };
  },
};
