// Upper bounds include the current deterministic and LLM check registry, including
// legacy hygiene rows that older reports counted inside these categories. Unknown
// or newly expanded categories fail closed until their denominator is reviewed.
const MAX_CHECKS_BY_CATEGORY: Readonly<Record<string, number>> = {
  ai_readiness: 9,
  extractability: 11,
  trust: 4,
};

/** Reject legacy weighted denominators that were once stored in checkCount. */
export function credibleCheckCount(category: string, value: number): number | null {
  const maximumForCategory = MAX_CHECKS_BY_CATEGORY[category] ?? 0;
  return Number.isInteger(value) && value > 0 && value <= maximumForCategory ? value : null;
}
