import { describe, expect, it, vi } from 'vitest';
import {
  enrichApolloCandidates,
  parseApolloEnrichedContact,
  parseApolloSearchCandidates,
  searchApolloQuebecMspCandidates,
  type ApolloSearchCandidate,
} from './apollo-campaign-intake';

const candidate: ApolloSearchCandidate = {
  personId: 'person-1', firstName: 'Marie', lastName: 'Roy', title: 'Founder',
  linkedinUrl: 'https://linkedin.com/in/marie', company: 'Northstar IT', domain: 'northstarit.ca',
  companyLinkedinUrl: null, city: 'Montréal', state: 'Quebec', country: 'Canada',
  industry: 'Information Technology & Services', keywords: 'managed IT services, cybersecurity', employeeCount: 12,
};

describe('Apollo campaign intake', () => {
  it('keeps only unique Quebec MSP decision-maker candidates', () => {
    const rows = parseApolloSearchCandidates({ people: [
      { id: 'person-1', first_name: 'Marie', last_name: 'Roy', title: 'Founder', organization: { name: 'Northstar IT', primary_domain: 'northstarit.ca', city: 'Montréal', state: 'Quebec', country: 'Canada', industry: 'Information Technology & Services', keywords: ['managed IT services'] } },
      { id: 'person-2', first_name: 'Sam', title: 'Owner', organization: { name: 'Unrelated Bakery', primary_domain: 'bakery.ca', state: 'Quebec', country: 'Canada', industry: 'Food' } },
    ] });
    expect(rows).toEqual([expect.objectContaining({ personId: 'person-1', domain: 'northstarit.ca' })]);
  });

  it('rejects free-mail, unverified, and wrong-domain enrichment results', () => {
    expect(parseApolloEnrichedContact(candidate, { person: { email: 'marie@gmail.com', email_status: 'verified' } })).toBeNull();
    expect(parseApolloEnrichedContact(candidate, { person: { email: 'marie@northstarit.ca', email_status: 'unverified' } })).toBeNull();
    expect(parseApolloEnrichedContact(candidate, { person: { email: 'marie@other.ca', email_status: 'verified' } })).toBeNull();
    expect(parseApolloEnrichedContact(candidate, { person: { email: 'marie@northstarit.ca', email_status: 'verified' } }))
      .toEqual(expect.objectContaining({ email: 'marie@northstarit.ca', emailStatus: 'verified' }));
  });

  it('uses the zero-credit search endpoint with bounded Quebec MSP filters', async () => {
    const request = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ people: [] }), { status: 200 }));
    await searchApolloQuebecMspCandidates({ apiKey: 'key', fetcher: request as unknown as typeof fetch, perPage: 250 });
    expect(request).toHaveBeenCalledOnce();
    expect(String(request.mock.calls[0]?.[0])).toContain('/mixed_people/api_search');
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body['per_page']).toBe(100);
    expect(body['organization_locations']).toEqual(['Quebec, Canada']);
    expect(body['contact_email_status']).toEqual(['verified']);
  });

  it('caps enrichment attempts and never requests phone, personal email, or waterfall data', async () => {
    const request = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ person: { email: 'marie@northstarit.ca', email_status: 'verified' } }), { status: 200 }));
    const result = await enrichApolloCandidates({ apiKey: 'key', candidates: Array.from({ length: 12 }, (_, index) => ({ ...candidate, personId: `person-${String(index)}` })), maxCredits: 8, fetcher: request as unknown as typeof fetch });
    expect(result.attempted).toBe(8);
    expect(request).toHaveBeenCalledTimes(8);
    for (const [url] of request.mock.calls) {
      const parsed = new URL(String(url));
      expect(parsed.searchParams.get('reveal_phone_number')).toBe('false');
      expect(parsed.searchParams.get('reveal_personal_emails')).toBe('false');
      expect(parsed.searchParams.has('run_waterfall_email')).toBe(false);
    }
  });
});
