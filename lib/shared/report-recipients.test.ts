import { describe, expect, it } from 'vitest';
import { parseReportRecipients, recipientsFromMetadata } from './report-recipients';

describe('report recipients', () => {
  it('accepts comma, semicolon, whitespace, and removes duplicates', () => {
    expect(parseReportRecipients('Owner@Example.com, client@example.com\nowner@example.com')).toEqual([
      'owner@example.com',
      'client@example.com',
    ]);
  });

  it('drops invalid addresses and limits delivery fan-out', () => {
    expect(parseReportRecipients('bad, a@x.com b@x.com c@x.com', 2)).toEqual(['a@x.com', 'b@x.com']);
  });

  it('keeps the legacy primary recipient first', () => {
    expect(recipientsFromMetadata('client@example.com', {
      report_recipients: ['owner@example.com', 'client@example.com'],
    })).toEqual(['client@example.com', 'owner@example.com']);
  });
});
