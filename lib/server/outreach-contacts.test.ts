import { describe, expect, it } from 'vitest';
import { normalizeSegment, parseContactImport, staggeredRunTimes } from './outreach-contacts';

describe('normalizeSegment', () => {
  it('kebab-cases human input and rejects junk', () => {
    expect(normalizeSegment('Marketing Agencies QC')).toBe('marketing-agencies-qc');
    expect(normalizeSegment('  MSP / IT — Québec ')).toBe('msp-it-qu-bec');
    expect(normalizeSegment('!')).toBeNull();
  });
});

describe('parseContactImport', () => {
  it('parses full rows, skips headers/comments/dupes, flags invalid lines', () => {
    const out = parseContactImport(
      [
        'email, url, name, company, city',
        '# a comment',
        'ceo@acme.ca, acme.ca, Jane Roy, Acme Marketing, Montréal',
        'ceo@acme.ca, acme.ca',
        'not-an-email, acme.ca',
        'ok@beta.ca, beta.ca, , Beta, Québec',
      ].join('\n')
    );
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toEqual({
      email: 'ceo@acme.ca',
      url: 'https://acme.ca/',
      name: 'Jane Roy',
      company: 'Acme Marketing',
      city: 'Montréal',
    });
    expect(out.invalid).toHaveLength(1);
    expect(out.invalid[0]?.reason).toBe('invalid email');
  });
});

describe('staggeredRunTimes', () => {
  it('spaces sends one per hour from the start time', () => {
    const start = Date.parse('2026-07-23T13:05:00Z');
    const times = staggeredRunTimes(start, 3);
    expect(times).toEqual([
      '2026-07-23T13:05:00.000Z',
      '2026-07-23T14:05:00.000Z',
      '2026-07-23T15:05:00.000Z',
    ]);
  });
});
