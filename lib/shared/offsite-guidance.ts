/**
 * Off-site / local / entity module (spec §2.3 / C8).
 *
 * Different AI engines cite different sources — a one-size "get listed everywhere"
 * recommendation is wrong. Each lever below names the engine(s) it actually helps,
 * with the study behind the claim (spec §7 verified stat pack).
 *
 * Two hard truths this module encodes:
 *   - ChatGPT cannot read Google Business Profile reviews directly — GBP helps Google
 *     surfaces, not ChatGPT. ChatGPT leans on third-party directories (Yelp #1, BBB).
 *   - Reviews are both an eligibility signal (presence/consistency/velocity) and a
 *     qualitative one. Never fabricate or inflate counts.
 */

export interface OffsiteLever {
  id: string;
  title: string;
  engines: string[];
  ownerRole: string;
  what: string;
  why: string;
  stat?: { claim: string; source: string };
}

export const OFFSITE_MODULE: {
  headline: string;
  intro: string;
  levers: OffsiteLever[];
  reviewsNote: string;
} = {
  headline: 'Beyond your website — where AI engines actually look you up',
  intro:
    'Roughly 86% of AI citations come from brand-managed sources: about 44% from the ' +
    'brand\'s own site and 42% from listings and directories (Yext). Your website is half ' +
    'the battle; these levers are the other half — and each engine weighs them differently.',
  levers: [
    {
      id: 'yelp-bbb',
      title: 'Yelp + BBB profiles',
      engines: ['ChatGPT'],
      ownerRole: 'You',
      what: 'Claim and complete your Yelp and Better Business Bureau profiles: exact business name, address, phone, services, hours, photos.',
      why: 'ChatGPT\'s local answers lean on third-party directories — and it cannot read Google Business Profile reviews at all. Yelp and BBB are its top sources.',
      stat: {
        claim: '~48.7% of ChatGPT citations come from third-party directories; Yelp is cited ~3.4x the #2 platform (BBB)',
        source: 'Yext (6.8M citations); Foundation/AirOps (28M AI responses)',
      },
    },
    {
      id: 'bing-places',
      title: 'Bing Places for Business',
      engines: ['ChatGPT', 'Copilot'],
      ownerRole: 'You',
      what: 'Claim your Bing Places listing (you can import it from Google Business Profile in minutes) and keep it current.',
      why: 'ChatGPT search still leans on the Bing index, especially for local queries — a missing Bing listing is a missing ChatGPT signal.',
    },
    {
      id: 'gbp',
      title: 'Google Business Profile',
      engines: ['Google AI Overviews', 'Gemini'],
      ownerRole: 'Google Business Profile manager',
      what: 'Complete every GBP field: categories, services, service area, hours, photos, Q&A. Post updates monthly.',
      why: 'GBP powers Google\'s local surfaces and AI Overviews. Note: this helps GOOGLE surfaces — ChatGPT cannot read GBP reviews, so do not expect it to move ChatGPT.',
      stat: {
        claim: 'Only ~1.2% of local businesses are recommended by ChatGPT vs ~35.9% in Google\'s local 3-pack — the engines really do diverge',
        source: 'SOCi 2026 Local Visibility Index (~350k locations)',
      },
    },
    {
      id: 'own-site-schema',
      title: 'Your own site + LocalBusiness schema',
      engines: ['Gemini'],
      ownerRole: 'WordPress admin',
      what: 'Keep the site\'s LocalBusiness JSON-LD complete (name, address, phone, areaServed) and build a landing page per service area.',
      why: 'Gemini favors brand-owned websites over directories — your own pages and schema are the highest-leverage Gemini input.',
      stat: { claim: '~52% of Gemini citations come from brand-owned sites', source: 'Yext analysis' },
    },
    {
      id: 'apple-business-connect',
      title: 'Apple Business Connect',
      engines: ['Siri', 'Apple Maps'],
      ownerRole: 'You',
      what: 'Claim your free Apple Business Connect listing with matching NAP details.',
      why: 'Feeds Apple Maps and Siri answers, and is one more consistent identity anchor for every engine that cross-checks entities.',
    },
    {
      id: 'niche-directories',
      title: 'Niche + review platforms (G2, Capterra, Trustpilot, vertical directories)',
      engines: ['Perplexity', 'ChatGPT'],
      ownerRole: 'Marketing/content person',
      what: 'List the business on the directories your industry actually uses (for an MSP: Cloudtango, UpCity, Clutch, local chamber listings).',
      why: 'Perplexity favors recency, Reddit, and niche/vertical directories over generic ones.',
      stat: {
        claim: 'Presence on G2/Capterra/Trustpilot/Yelp correlates with roughly 3x more AI citations',
        source: '5W synthesis of 9 datasets',
      },
    },
    {
      id: 'nap-consistency',
      title: 'NAP consistency sweep',
      engines: ['All engines'],
      ownerRole: 'Marketing/content person',
      what: 'Make the business Name, Address, and Phone IDENTICAL everywhere — site footer, schema, GBP, Yelp, BBB, Bing, Apple, directories. Fix old addresses and tracking numbers.',
      why: 'Engines resolve you as an entity by cross-checking these sources; every mismatch weakens the match and splits your identity.',
    },
    {
      id: 'reviews',
      title: 'Review depth and velocity',
      engines: ['All engines'],
      ownerRole: 'You',
      what: 'Ask every happy customer for a review on the platform that matters for your target engine (Yelp/BBB for ChatGPT, Google for AI Overviews). Respond to every review, good or bad.',
      why: 'Review presence, recency, and steadiness act as an eligibility signal, and the text itself feeds qualitative judgments about you.',
    },
  ],
  reviewsNote:
    'Review guidance is directional — engines do not publish thresholds, and buying or faking ' +
    'reviews risks platform bans and poisoned AI summaries. Steady, real reviews beat bursts.',
};
