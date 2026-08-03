import { describe, expect, it, vi } from 'vitest';
import {
  LINKEDIN_COMPANY_REQUIRED_SCOPES,
  assertLinkedInCompanyScopes,
  buildLinkedInRestHeaders,
  buildLinkedInTextPostPayload,
  resolveApprovedLinkedInOrganization,
} from './linkedin-company-publishing';

describe('LinkedIn Company Page publishing', () => {
  it('requires only the approved Company Page scopes', () => {
    expect(() => assertLinkedInCompanyScopes(LINKEDIN_COMPANY_REQUIRED_SCOPES)).not.toThrow();
    expect(() => assertLinkedInCompanyScopes(['w_organization_social'])).toThrow(
      'rw_organization_admin'
    );
    expect(() =>
      assertLinkedInCompanyScopes([...LINKEDIN_COMPANY_REQUIRED_SCOPES, 'w_member_social'])
    ).toThrow('unapproved scopes');
  });

  it('adds the LinkedIn REST version and protocol headers', () => {
    expect(buildLinkedInRestHeaders({ accessToken: 'secret', apiVersion: '202607' })).toEqual({
      Authorization: 'Bearer secret',
      'Linkedin-Version': '202607',
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
    });
  });

  it('selects exactly the approved GEO-Pulse organization', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            elements: [
              { organization: 'urn:li:organization:111' },
              { organization: 'urn:li:organization:222' },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 111,
            localizedName: 'Another Company',
            localizedWebsite: 'https://example.com',
            vanityName: 'another-company',
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 222,
            localizedName: 'GEO-Pulse',
            localizedWebsite: 'https://getgeopulse.com',
            vanityName: 'geo-pulse',
          }),
          { status: 200 }
        )
      ) as typeof fetch;

    await expect(
      resolveApprovedLinkedInOrganization({
        accessToken: 'secret',
        expectedName: 'GEO-Pulse',
        expectedWebsiteHost: 'getgeopulse.com',
        expectedVanityNames: ['geo-pulse', 'getgeopulse'],
        fetchImpl,
      })
    ).resolves.toMatchObject({
      id: '222',
      organizationUrn: 'urn:li:organization:222',
      localizedName: 'GEO-Pulse',
    });
  });

  it('refuses a different company page even when the member administers it', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ elements: [{ organization: 'urn:li:organization:111' }] }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            localizedName: 'Lifter',
            localizedWebsite: 'https://lifter.ca',
            vanityName: 'lifter',
          }),
          { status: 200 }
        )
      ) as typeof fetch;

    await expect(
      resolveApprovedLinkedInOrganization({
        accessToken: 'secret',
        expectedName: 'GEO-Pulse',
        expectedWebsiteHost: 'getgeopulse.com',
        expectedVanityNames: ['geo-pulse'],
        fetchImpl,
      })
    ).rejects.toThrow('did not match the GEO-Pulse Company Page');
  });

  it('builds current Posts API payloads only for organization authors', () => {
    expect(
      buildLinkedInTextPostPayload({
        authorUrn: 'urn:li:organization:222',
        commentary: 'A buyer question worth tracking.',
        imageUrn: 'urn:li:image:image-1',
        imageAltText: 'GEO-Pulse benchmark chart',
      })
    ).toMatchObject({
      author: 'urn:li:organization:222',
      commentary: 'A buyer question worth tracking.',
      content: { media: { id: 'urn:li:image:image-1', altText: 'GEO-Pulse benchmark chart' } },
    });
    expect(() =>
      buildLinkedInTextPostPayload({
        authorUrn: 'urn:li:person:founder',
        commentary: 'Never publish this.',
      })
    ).toThrow('Company Page');
  });
});
