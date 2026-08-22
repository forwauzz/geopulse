import { describe, expect, it, vi } from 'vitest';
import {
  BREVO_SCOPE,
  buildBrevoAuthorizeUrl,
  listBrevoContacts,
  listBrevoLists,
  sendBrevoTransactionalEmail,
  syncBrevoReportProjection,
  toContactProjection,
} from './brevo';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const AGENCY_ID = '22222222-2222-4222-8222-222222222222';

describe('Brevo provider adapter', () => {
  it('requests the minimum scopes needed for contact review, projection, and provider delivery', () => {
    const url = new URL(buildBrevoAuthorizeUrl({
      clientId: 'client', redirectUri: 'https://getgeopulse.com/api/connectors/brevo/callback', state: 'state',
    }));
    expect(url.searchParams.get('scope')).toBe(BREVO_SCOPE);
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('creates only missing GEO-Pulse attributes and updates one contact without unrelated fields', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ attributes: [{ name: 'GEOPULSE_REPORT_URL' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await syncBrevoReportProjection({
      accessToken: 'token', providerContactId: '1592', reportUrl: 'https://getgeopulse.com/report/token',
      thumbnailUrl: 'https://getgeopulse.com/thumbnail/token', generatedAt: '2026-08-12T14:00:00.000Z', fetcher,
    });
    expect(fetcher).toHaveBeenCalledTimes(5);
    const final = (fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[4]!;
    expect(final[0]).toContain('/contacts/1592?identifierType=contact_id');
    expect(JSON.parse(String((final[1] as RequestInit).body))).toEqual({ attributes: {
      GEOPULSE_REPORT_URL: 'https://getgeopulse.com/report/token',
      GEOPULSE_REPORT_THUMBNAIL: 'https://getgeopulse.com/thumbnail/token',
      GEOPULSE_REPORT_STATUS: 'READY', GEOPULSE_REPORT_GENERATED_AT: '2026-08-12',
    } });
  });

  it('sends exactly one provider-native transactional recipient', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ messageId: '<alie@brevo>' }), { status: 201 }));
    await expect(sendBrevoTransactionalEmail({
      accessToken: 'token', sender: { email: 'reports@getgeopulse.com', name: 'GEO-Pulse' },
      recipient: { email: 'founder@alie.example', name: 'Founder Test' }, subject: 'Your report',
      htmlContent: '<p>Hello Uzziel</p>', fetcher,
    })).resolves.toBe('<alie@brevo>');
    const call = (fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0]!;
    const body = JSON.parse(String(call[1].body));
    expect(body.to).toEqual([{ email: 'founder@alie.example', name: 'Founder Test' }]);
  });

  it('maps bounded list responses', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      lists: [{ id: 8, name: 'MSP prospects', uniqueSubscribers: 12 }], count: 1,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(listBrevoLists({ accessToken: 'token', fetcher })).resolves.toEqual({
      lists: [{ id: '8', name: 'MSP prospects', contactCount: 12 }], count: 1,
    });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/contacts/lists?'), expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer token' }),
    }));
  });

  it('fails closed for unsubscribed and incomplete contacts', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ contacts: [
      { id: 1, email: 'ana@northstar.ca', attributes: { FIRSTNAME: 'Ana', COMPANY: 'Northstar', WEBSITE: 'https://northstar.ca' }, listIds: [8], listUnsubscribed: [], modifiedAt: '2026-08-12T08:00:00+00:00' },
      { id: 2, email: 'blocked@clinic.ca', attributes: { COMPANY: 'Clinic', WEBSITE: 'clinic.ca' }, listIds: [8], listUnsubscribed: [8] },
      { id: 3, email: 'person@gmail.com', attributes: { COMPANY: 'No Site' }, listIds: [8] },
    ], count: 3 }), { status: 200 }));
    const result = await listBrevoContacts({ accessToken: 'token', listId: '8', fetcher, now: '2026-08-12T12:00:00.000Z' });
    expect(result.contacts[0]).toMatchObject({
      canonicalDomain: 'northstar.ca', observedAt: '2026-08-12T08:00:00.000Z', selectionBlockReason: null,
    });
    expect(result.contacts[1]).toMatchObject({ suppressionState: 'unsubscribed', selectionBlockReason: expect.any(String) });
    expect(result.contacts[2]).toMatchObject({ canonicalDomain: null, selectionBlockReason: 'Company website is missing' });
    expect(toContactProjection({ accountId: ACCOUNT_ID, agencyAccountId: AGENCY_ID, candidate: result.contacts[0]! }))
      .toMatchObject({ provider: 'brevo', canonicalDomain: 'northstar.ca', suppressionState: 'eligible' });
    expect(() => toContactProjection({ accountId: ACCOUNT_ID, agencyAccountId: AGENCY_ID, candidate: result.contacts[1]! }))
      .toThrow('brevo_contact_not_selectable');
  });
});
