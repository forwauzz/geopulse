/**
 * llms.txt — weight 0, hygiene bucket (spec §2.5/C7).
 *
 * The authoritative proposal moved to v2 on 2026-08-10 and now documents path-scoped
 * files plus Markdown discovery links. None of the watched engines documents llms.txt
 * as a ranking or citation signal, so absence never penalizes and presence never
 * promises a visibility benefit.
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
        finding: `llms.txt found (${String(content.trim().length)} chars). It can provide an optional agent-readable overview, but no watched engine documents it as a ranking or citation signal, so no measurable visibility benefit is promised.`,
      };
    }

    return {
      id: 'llms-txt',
      passed: true,
      status: 'PASS',
      finding:
        'No /llms.txt file — and that is fine. The v2 proposal is optional, and no watched engine documents a ranking or citation benefit, so this check carries no score weight.',
    };
  },
};
