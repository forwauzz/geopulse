/**
 * Information gain / uniqueness (spec C15): engines cite what is semantically distinct
 * from what the model already knows. Templated agency copy ("best-in-class solutions
 * tailored to your needs") adds nothing; specifics — numbers, prices, dates, named
 * clients, response times — do. Adding citations/statistics can lift AI visibility up
 * to ~40% (Princeton GEO study, KDD 2024).
 *
 * Deterministic heuristic over the visible text: boilerplate density vs specificity
 * density. It flags, it does not condemn — WARNING is the worst outcome for prose.
 */
import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

const BOILERPLATE_PHRASES = [
  'best-in-class',
  'best in class',
  'cutting-edge',
  'cutting edge',
  'state-of-the-art',
  'state of the art',
  'world-class',
  'industry-leading',
  'industry leading',
  'solutions tailored',
  'tailored solutions',
  'tailored to your needs',
  'we are committed to',
  'committed to excellence',
  'unparalleled',
  'seamless integration',
  'seamlessly',
  'leverage the power',
  'unlock the power',
  'take your business to the next level',
  'next level',
  'one-stop shop',
  'peace of mind',
  'game-changing',
  'synerg',
  'empower your',
  'holistic approach',
];

export interface InformationGainSignals {
  boilerplateHits: string[];
  specificityHits: number;
  wordCount: number;
}

export function measureInformationGain(text: string): InformationGainSignals {
  const lower = text.toLowerCase();
  const boilerplateHits = BOILERPLATE_PHRASES.filter((p) => lower.includes(p));

  let specificityHits = 0;
  // Concrete numbers with units/context: prices, percentages, years, durations, counts.
  specificityHits += (text.match(/\$\s?\d[\d,.]*/g) ?? []).length; // prices
  specificityHits += (text.match(/\d+\s?%/g) ?? []).length; // percentages
  specificityHits += (text.match(/\b(19|20)\d{2}\b/g) ?? []).length; // years
  specificityHits += (text.match(/\b\d+\s?(minutes?|hours?|days?|years?|clients?|customers?|employees?|endpoints?|devices?|locations?|technicians?|tickets?)\b/gi) ?? []).length;
  specificityHits += (text.match(/\b(case stud|testimonial|certified|certification|iso \d+|soc 2|cissp|comptia|microsoft partner|award)/gi) ?? []).length;

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return { boilerplateHits, specificityHits, wordCount };
}

export const informationGainCheck: AuditCheck = {
  id: 'information-gain',
  name: 'Original, specific content (information gain)',
  weight: 3,
  category: 'trust',
  run(ctx: CheckContext): CheckResult {
    const s = measureInformationGain(ctx.textSample);

    if (s.wordCount < 80) {
      return {
        id: 'information-gain',
        passed: true,
        status: 'PASS',
        finding: 'Too little visible text to judge content uniqueness on this page.',
      };
    }

    const boilerplateDensity = s.boilerplateHits.length / Math.max(1, s.wordCount / 100);
    const hasSpecifics = s.specificityHits >= 3;

    if (s.boilerplateHits.length >= 4 && !hasSpecifics) {
      return {
        id: 'information-gain',
        passed: false,
        status: 'FAIL',
        finding: `The copy reads templated: ${String(s.boilerplateHits.length)} stock phrases (e.g. "${s.boilerplateHits.slice(0, 3).join('", "')}") and almost no concrete specifics (numbers, prices, dates, credentials). Engines cite what is distinct — generic copy is invisible to them.`,
        fix: 'Replace stock phrases with facts only you can claim: real response times, client counts, prices, certifications, named case studies. Adding citations and statistics can lift AI visibility up to ~40% (Princeton GEO study, KDD 2024).',
      };
    }

    if (s.boilerplateHits.length >= 2 && s.specificityHits < 5) {
      return {
        id: 'information-gain',
        passed: true,
        status: 'WARNING',
        finding: `Some templated phrasing (${s.boilerplateHits.slice(0, 3).join(', ')}) with only ${String(s.specificityHits)} concrete specifics. More original data would give engines a reason to cite this page over a competitor's.`,
        fix: 'Add specifics: numbers, dates, prices, certifications, or an original stat or case study.',
      };
    }

    return {
      id: 'information-gain',
      passed: true,
      status: 'PASS',
      finding: `Content carries ${String(s.specificityHits)} concrete specifics against ${String(s.boilerplateHits.length)} stock phrases — distinct enough to be citable. (Boilerplate density ${boilerplateDensity.toFixed(1)}/100 words.)`,
    };
  },
};
