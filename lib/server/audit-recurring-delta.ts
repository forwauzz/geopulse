export type AuditFindingStatus = 'PASS' | 'WARNING' | 'FAIL' | 'NOT_EVALUATED';
export type AuditDeltaState = 'new' | 'resolved' | 'regressed' | 'unchanged' | 'not_comparable';

export type AuditFindingSnapshot = {
  readonly checkId: string;
  readonly url: string;
  readonly status: AuditFindingStatus;
  readonly fix?: string | null;
};

export type AuditDeltaAction = {
  readonly state: AuditDeltaState;
  readonly checkId: string;
  readonly url: string;
  readonly previousStatus: AuditFindingStatus | null;
  readonly currentStatus: AuditFindingStatus | null;
  readonly owner: 'web_developer' | 'content' | 'marketing' | 'business_owner';
  readonly action: string;
  readonly verification: string;
};

function key(item: AuditFindingSnapshot): string {
  return `${item.checkId.trim().toLowerCase()}|${item.url.trim().toLowerCase().replace(/\/$/, '')}`;
}

function isComparable(status: AuditFindingStatus): boolean {
  return status !== 'NOT_EVALUATED';
}

function isProblem(status: AuditFindingStatus): boolean {
  return status === 'FAIL' || status === 'WARNING';
}

function ownerFor(checkId: string): AuditDeltaAction['owner'] {
  if (/(schema|canonical|robots|sitemap|header|redirect|status|html|meta)/i.test(checkId)) return 'web_developer';
  if (/(answer|faq|title|heading|content|service|author)/i.test(checkId)) return 'content';
  if (/(review|profile|citation|directory|offsite)/i.test(checkId)) return 'marketing';
  return 'business_owner';
}

export function buildAuditDelta(args: {
  baseline: readonly AuditFindingSnapshot[];
  current: readonly AuditFindingSnapshot[];
  generatedAt: string;
}) {
  const previous = new Map(args.baseline.map((item) => [key(item), item]));
  const current = new Map(args.current.map((item) => [key(item), item]));
  const keys = [...new Set([...previous.keys(), ...current.keys()])].sort();
  const actions: AuditDeltaAction[] = keys.map((itemKey) => {
    const before = previous.get(itemKey) ?? null;
    const after = current.get(itemKey) ?? null;
    let state: AuditDeltaState;
    if ((before && !isComparable(before.status)) || (after && !isComparable(after.status))) state = 'not_comparable';
    else if (!before && after) state = isProblem(after.status) ? 'new' : 'unchanged';
    else if (before && !after) state = 'not_comparable';
    else if (before && after && isProblem(before.status) && !isProblem(after.status)) state = 'resolved';
    else if (before && after && !isProblem(before.status) && isProblem(after.status)) state = 'regressed';
    else state = 'unchanged';
    const finding = after ?? before!;
    return {
      state,
      checkId: finding.checkId,
      url: finding.url,
      previousStatus: before?.status ?? null,
      currentStatus: after?.status ?? null,
      owner: ownerFor(finding.checkId),
      action: state === 'resolved' ? 'Keep the fix in place and monitor it.' : (after?.fix?.trim() || before?.fix?.trim() || 'Review the observed check and assign a concrete fix.'),
      verification: 'Run a fresh audit after the change and confirm this check passes on the same URL.',
    };
  });
  const count = (state: AuditDeltaState) => actions.filter((item) => item.state === state).length;
  return {
    contract: 'audit_delta_v1' as const,
    generatedAt: args.generatedAt,
    baseline: args.baseline.length === 0,
    counts: { new: count('new'), resolved: count('resolved'), regressed: count('regressed'), unchanged: count('unchanged'), notComparable: count('not_comparable') },
    actions,
    primaryCta: 'Monitor this website monthly and verify each fix with a fresh audit.',
    disclaimer: 'Observed website signals only; no ranking, citation, traffic, or revenue outcome is guaranteed.',
  };
}
