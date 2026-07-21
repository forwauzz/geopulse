import { describe, expect, it } from 'vitest';
import { parseProspectImport } from './outreach-import';
import { formatReportTimestamp } from '../../workers/report/report-timestamp';

describe('parseProspectImport (issue #94)', () => {
  it('parses minimal email+website lines and normalizes URLs', () => {
    const r = parseProspectImport('jane@acme.ca, acme.ca\nmark@nord.ca\thttps://nord.ca/');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ email: 'jane@acme.ca', url: 'https://acme.ca/', cadence: 'monthly' });
    expect(r.rows[1]?.url).toBe('https://nord.ca/');
    expect(r.invalid).toHaveLength(0);
  });

  it('parses full rows with name, company and cadence', () => {
    const r = parseProspectImport('jane@acme.ca; acme.ca; Jane; Acme IT; weekly');
    expect(r.rows[0]).toMatchObject({ name: 'Jane', company: 'Acme IT', cadence: 'weekly' });
  });

  it('skips a header row, comments, and blank lines', () => {
    const r = parseProspectImport('email,website,name\n\n# my notes\njane@acme.ca, acme.ca');
    expect(r.skippedHeader).toBe(true);
    expect(r.rows).toHaveLength(1);
    expect(r.invalid).toHaveLength(0);
  });

  it('flags invalid emails/urls with the line number and reason', () => {
    const r = parseProspectImport('not-an-email, acme.ca\njane@acme.ca, not a url at all');
    expect(r.rows).toHaveLength(0);
    expect(r.invalid).toHaveLength(2);
    expect(r.invalid[0]?.reason).toContain('email');
    expect(r.invalid[1]?.reason).toContain('website');
  });

  it('dedupes repeated email+url pairs within one import', () => {
    const r = parseProspectImport('jane@acme.ca, acme.ca\nJANE@ACME.CA, https://acme.ca/');
    expect(r.rows).toHaveLength(1);
    expect(r.invalid[0]?.reason).toContain('duplicate');
  });

  it('caps at 500 rows', () => {
    const lines = Array.from({ length: 505 }, (_, i) => `user${String(i)}@x.ca, site${String(i)}.ca`).join('\n');
    const r = parseProspectImport(lines);
    expect(r.rows).toHaveLength(500);
    expect(r.invalid.some((x) => x.reason.includes('cap'))).toBe(true);
  });

  it('defaults unknown cadence to monthly', () => {
    const r = parseProspectImport('jane@acme.ca, acme.ca, Jane, Acme, fortnightly');
    expect(r.rows[0]?.cadence).toBe('monthly');
  });
});

describe('formatReportTimestamp (issue #94)', () => {
  it('renders date AND time in UTC', () => {
    expect(formatReportTimestamp('2026-07-21T18:45:12.000Z')).toBe('2026-07-21, 18:45 UTC');
  });
  it('passes through unparseable input', () => {
    expect(formatReportTimestamp('not-a-date')).toBe('not-a-date');
  });
});
