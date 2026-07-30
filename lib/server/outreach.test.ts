import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOutreachEmailHtml,
  computeNextOutreachRun,
  normalizeOutreachCadence,
  sendOutreachEmail,
} from './outreach';

describe('normalizeOutreachCadence', () => {
  it('accepts the four cadences and defaults to monthly', () => {
    expect(normalizeOutreachCadence('hourly')).toBe('hourly');
    expect(normalizeOutreachCadence('Daily')).toBe('daily');
    expect(normalizeOutreachCadence('weekly')).toBe('weekly');
    expect(normalizeOutreachCadence('monthly')).toBe('monthly');
    expect(normalizeOutreachCadence('fortnightly')).toBe('monthly');
    expect(normalizeOutreachCadence(null)).toBe('monthly');
  });
});

describe('computeNextOutreachRun', () => {
  it('advances by the cadence interval', () => {
    const now = Date.parse('2026-07-21T12:00:00Z');
    expect(computeNextOutreachRun('hourly', now)).toBe('2026-07-21T13:00:00.000Z');
    expect(computeNextOutreachRun('daily', now)).toBe('2026-07-22T12:00:00.000Z');
    expect(computeNextOutreachRun('weekly', now)).toBe('2026-07-28T12:00:00.000Z');
    expect(computeNextOutreachRun('monthly', now)).toBe('2026-08-20T12:00:00.000Z');
  });
});

describe('buildOutreachEmailHtml', () => {
  const args = {
    recipientName: 'Ernesto',
    domain: 'mipsmedia.com',
    score: 67,
    grade: 'C+',
    topIssues: [
      { check: 'JSON-LD', fix: 'Add Organization schema.' },
      { check: 'llms.txt', fix: 'Publish /llms.txt.' },
    ],
    resultsUrl: 'https://getgeopulse.com/results/abc',
    walkthroughUrl: 'https://getgeopulse.com/walkthrough?source=outreach',
    pixelUrl: 'https://getgeopulse.com/api/outreach/open/send-1',
    unsubscribeUrl: 'https://getgeopulse.com/api/outreach/unsubscribe/p-1',
  };

  it('includes the score, greeting, report link and tracking pixel', () => {
    const html = buildOutreachEmailHtml(args);
    expect(html).toContain('Hi Ernesto,');
    expect(html).toContain('67');
    expect(html).toContain('Grade C+');
    expect(html).toContain('https://getgeopulse.com/results/abc');
    expect(html).toContain('https://getgeopulse.com/walkthrough?source=outreach');
    expect(html).toContain('https://getgeopulse.com/api/outreach/open/send-1');
    expect(html).toContain('JSON-LD');
  });

  it('degrades without a name and without issues', () => {
    const html = buildOutreachEmailHtml({ ...args, recipientName: null, topIssues: [] });
    expect(html).toContain('Hi,');
    expect(html).not.toContain('biggest opportunities');
  });

  it('carries the CASL unsubscribe link and sender identification (issue #97)', () => {
    const html = buildOutreachEmailHtml(args);
    expect(html).toContain('https://getgeopulse.com/api/outreach/unsubscribe/p-1');
    expect(html).toContain('Unsubscribe');
    expect(html).toContain('Montréal, Québec, Canada');
  });
});
describe('sendOutreachEmail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries a transient provider failure with the same idempotency key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'slow down' }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendOutreachEmail(
      { RESEND_API_KEY: 're_test', RESEND_FROM_EMAIL: 'reports@getgeopulse.com' },
      'buyer@example.com',
      'Subject',
      '<p>Hello</p>',
      'outreach-send-123',
    );

    expect(result).toEqual({ ok: true, providerMessageId: 'email_123' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(firstInit.headers).toMatchObject({ 'Idempotency-Key': 'outreach-send-123' });
    expect(secondInit.headers).toMatchObject({ 'Idempotency-Key': 'outreach-send-123' });
    expect(secondInit.body).toBe(firstInit.body);
  });

  it('does not retry a permanent provider rejection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ name: 'validation_error', message: 'bad recipient' }), { status: 400 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendOutreachEmail(
      { RESEND_API_KEY: 're_test', RESEND_FROM_EMAIL: 'reports@getgeopulse.com' },
      'bad@example.com',
      'Subject',
      '<p>Hello</p>',
      'outreach-send-456',
    );

    expect(result).toEqual({ ok: false, detail: 'http_400 validation_error: bad recipient' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
