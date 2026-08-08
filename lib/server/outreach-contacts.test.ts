import { describe, expect, it } from 'vitest';
import { addSegmentToSequence, importContacts, normalizeSegment, parseContactCsvImport, parseContactImport, staggeredRunTimes } from './outreach-contacts';

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
      personalizationReason: null,
      personalizationSourceUrl: null,
    });
    expect(out.invalid).toHaveLength(1);
    expect(out.invalid[0]?.reason).toBe('invalid email');
  });
  it('captures a truthful personalization reason only with a valid HTTPS source', () => {
    const out = parseContactImport(
      'owner@msp.ca, msp.ca, Alex, Northstar IT, Toronto, Public security services page, https://msp.ca/security'
    );
    expect(out.invalid).toEqual([]);
    expect(out.rows[0]).toMatchObject({
      personalizationReason: 'Public security services page',
      personalizationSourceUrl: 'https://msp.ca/security',
    });

    const invalid = parseContactImport(
      'owner@msp.ca, msp.ca, Alex, Northstar IT, Toronto, Claimed signal, http://msp.ca/security'
    );
    expect(invalid.rows).toEqual([]);
    expect(invalid.invalid[0]?.reason).toBe('invalid personalization source url');
  });
});

describe('parseContactCsvImport', () => {
  it('maps Apollo exports, respects quoted commas, deduplicates, and holds missing-email rows out', () => {
    const out = parseContactCsvImport([
      'First Name,Last Name,Title,Company Name,Email,Email Status,Primary Email Catch-all Status,Person Linkedin Url,Website,City,State,Country,Apollo Contact Id',
      'Jane,Roy,"Founder, CEO",Northstar IT,jane@northstar.ca,Verified,Not Catch-all,https://linkedin.com/in/jane,https://northstar.ca,MontrÃ©al,Quebec,Canada,apollo-1',
      'Jane,Roy,"Founder, CEO",Northstar IT,jane@northstar.ca,Verified,Not Catch-all,https://linkedin.com/in/jane,https://northstar.ca,MontrÃ©al,Quebec,Canada,apollo-1',
      'No,Email,CEO,Missing Address,,New Data Available,,https://linkedin.com/in/no-email,https://missing.ca,Toronto,Ontario,Canada,apollo-2',
    ].join('\n'));

    expect(out.rows).toHaveLength(1);
    expect(out.invalid).toEqual([{ line: 4, text: '', reason: 'missing or invalid email' }]);
    expect(out.rows[0]).toMatchObject({
      email: 'jane@northstar.ca',
      url: 'https://northstar.ca/',
      name: 'Jane Roy',
      company: 'Northstar IT',
      contactTitle: 'Founder, CEO',
      city: 'MontrÃ©al',
      region: 'MontrÃ©al, Quebec, Canada',
      provenance: {
        provider: 'apollo',
        provider_email_status: 'Verified',
        provider_catch_all_status: 'Not Catch-all',
        provider_contact_id: 'apollo-1',
      },
    });
  });
});

describe('importContacts', () => {
  it('inserts only new contacts as held and preserves existing rows', async () => {
    let insertedPayload: Record<string, unknown>[] = [];
    const supabase = {
      from() {
        return {
          select() {
            return {
              in: async () => ({ data: [{ email: 'existing@example.ca' }], error: null }),
            };
          },
          upsert(payload: Record<string, unknown>[]) {
            insertedPayload = payload;
            return {
              select: async () => ({ data: payload.map((row) => ({ email: row.email })), error: null }),
            };
          },
        };
      },
    } as never;

    const result = await importContacts(supabase, [
      { email: 'existing@example.ca', url: 'https://example.ca', name: null, company: null, city: null },
      { email: 'new@example.ca', url: 'https://example.ca', name: 'New Owner', company: 'Example', city: 'MontrÃ©al' },
    ], { segment: 'apollo-import-2026-08', source: 'provider-csv' });

    expect(result).toEqual({ imported: 1, skippedExisting: 1 });
    expect(insertedPayload).toHaveLength(1);
    expect(insertedPayload[0]).toMatchObject({
      email: 'new@example.ca',
      eligibility_status: 'needs_verification',
      eligibility_reason: 'founder_authorized_import_requires_verification',
      source_class: 'operator_manual',
      segment: 'apollo-import-2026-08',
    });
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

describe('bank to sequence eligibility boundary', () => {
  it('never promotes quarantined, rejected, suppressed, converted, or enrolled contacts', async () => {
    const contacts = ['needs_verification', 'rejected', 'suppressed', 'converted', 'enrolled'].map((status, index) => ({
      id: `contact-${String(index)}`,
      email: `owner${String(index)}@example.ca`,
      name: `Owner ${String(index)}`,
      company: 'Example',
      url: 'https://example.ca',
      segment: 'quarantine',
      tags: [],
      city: 'Montreal',
      source: 'test',
      personalization_reason: null,
      personalization_source_url: null,
      personalization_verified_at: null,
      added_to_sequence_at: null,
      eligibility_status: status,
      created_at: '2026-08-03T00:00:00.000Z',
    }));
    let prospectTableTouched = false;
    function query(data: unknown): any {
      const builder: any = Promise.resolve({ data, error: null });
      for (const method of ['order', 'limit', 'eq']) builder[method] = () => builder;
      return builder;
    }
    const supabase = {
      from(table: string) {
        if (table === 'outreach_prospects') prospectTableTouched = true;
        return { select: () => query(table === 'outreach_contacts' ? contacts : []) };
      },
    } as never;

    const result = await addSegmentToSequence({
      supabase,
      segment: 'quarantine',
      startMs: Date.parse('2026-08-03T13:00:00.000Z'),
    });
    expect(result).toEqual({
      added: 0,
      skippedUnsubscribed: 0,
      skippedExisting: 0,
      skippedIneligible: 5,
    });
    expect(prospectTableTouched).toBe(false);
  });
});
