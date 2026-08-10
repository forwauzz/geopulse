/**
 * Off-site / local / entity module (spec §2.3 / C8).
 *
 * Different AI engines cite different sources — a one-size "get listed everywhere"
 * recommendation is wrong. Each lever below names the intended surface and uses
 * bounded, directional guidance rather than an unsupported numerical promise.
 *
 * Guidance is deliberately directional: source selection changes by engine, query,
 * location, and time. Never fabricate or inflate review counts.
 */

export interface OffsiteLever {
  id: string;
  title: string;
  engines: string[];
  ownerRole: string;
  what: string;
  why: string;
}

export const OFFSITE_MODULE: {
  headline: string;
  intro: string;
  levers: OffsiteLever[];
  reviewsNote: string;
} = {
  headline: 'Beyond your website — where AI engines actually look you up',
  intro:
    'AI assistants may reuse information from your website, business profiles, and relevant ' +
    'third-party directories. Keep those sources complete and consistent, then verify changes ' +
    'with fresh tests because source selection varies by engine, query, location, and time.',
  levers: [
    {
      id: 'yelp-bbb',
      title: 'Yelp + BBB profiles',
      engines: ['ChatGPT'],
      ownerRole: 'You',
      what: 'Claim and complete your Yelp and Better Business Bureau profiles: exact business name, address, phone, services, hours, photos.',
      why: 'Relevant third-party profiles give search and answer systems another source for confirming business identity and service details.',
    },
    {
      id: 'bing-places',
      title: 'Bing Places for Business',
      engines: ['ChatGPT', 'Copilot'],
      ownerRole: 'You',
      what: 'Claim your Bing Places listing (you can import it from Google Business Profile in minutes) and keep it current.',
      why: 'A current Bing listing can improve the business information available to Bing-powered search surfaces.',
    },
    {
      id: 'gbp',
      title: 'Google Business Profile',
      engines: ['Google AI Overviews', 'Gemini'],
      ownerRole: 'Google Business Profile manager',
      what: 'Complete every GBP field: categories, services, service area, hours, photos, Q&A. Post updates monthly.',
      why: 'Google Business Profile supplies business information to Google\'s local surfaces. Treat it as a Google lever, not proof of visibility in other assistants.',
    },
    {
      id: 'own-site-schema',
      title: 'Your own site + LocalBusiness schema',
      engines: ['Gemini'],
      ownerRole: 'WordPress admin',
      what: 'Keep the site\'s LocalBusiness JSON-LD complete (name, address, phone, areaServed) and build a landing page per service area.',
      why: 'Clear first-party pages and valid schema help systems interpret the business, services, and service area. They do not guarantee selection or citation.',
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
      why: 'Relevant vertical profiles can provide independent context about the business. Prioritize directories real buyers use instead of listing everywhere.',
    },
    {
      id: 'nap-consistency',
      title: 'NAP consistency sweep',
      engines: ['All engines'],
      ownerRole: 'Marketing/content person',
      what: 'Make the business Name, Address, and Phone IDENTICAL everywhere — site footer, schema, GBP, Yelp, BBB, Bing, Apple, directories. Fix old addresses and tracking numbers.',
      why: 'Consistent identity details reduce ambiguity when people and automated systems compare sources.',
    },
    {
      id: 'reviews',
      title: 'Review depth and velocity',
      engines: ['All engines'],
      ownerRole: 'You',
      what: 'Ask every happy customer for a review on the credible platform their buyers already use. Respond to every review, good or bad.',
      why: 'Authentic reviews give prospective buyers useful context and may be available to search surfaces that index the review platform.',
    },
  ],
  reviewsNote:
    'Review guidance is directional — engines do not publish thresholds, and buying or faking ' +
    'reviews risks platform bans and poisoned AI summaries. Steady, real reviews beat bursts.',
};
