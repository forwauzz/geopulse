import { describe, expect, it } from 'vitest';
import { selectSavedApolloContacts, type SavedApolloContact } from './saved-apollo-campaign-intake';

const emptyEvidence = {
  unsubscribedEmails: new Set<string>(),
  convertedEmails: new Set<string>(),
  suppressedEmails: new Set<string>(),
  activeSequenceEmails: new Set<string>(),
  enrolledContactIds: new Set<string>(),
};

function contact(overrides: Partial<SavedApolloContact> = {}): SavedApolloContact {
  return {
    id: 'contact-1',
    email: 'jane.roy@northstarit.ca',
    name: 'Jane Roy',
    company: 'Northstar IT',
    url: 'https://northstarit.ca',
    companyDomain: 'northstarit.ca',
    contactTitle: 'Owner',
    eligibilityStatus: 'needs_verification',
    tags: ['apollo'],
    ...overrides,
  };
}

describe('selectSavedApolloContacts', () => {
  it('accepts a named business contact from the saved Apollo export without provider re-enrichment', () => {
    const result = selectSavedApolloContacts({ contacts: [contact()], evidence: emptyEvidence, limit: 8 });
    expect(result.selected.map((item) => item.id)).toEqual(['contact-1']);
    expect(result.rejectedCounts).toEqual({});
  });

  it('fails closed for suppression, generic inboxes, and website-domain mismatches', () => {
    const result = selectSavedApolloContacts({
      contacts: [
        contact({ id: 'suppressed', email: 'sam@blocked.ca', companyDomain: 'blocked.ca', url: 'https://blocked.ca' }),
        contact({ id: 'generic', email: 'info@northstarit.ca' }),
        contact({ id: 'mismatch', email: 'jane@other.ca' }),
      ],
      evidence: { ...emptyEvidence, suppressedEmails: new Set(['sam@blocked.ca']) },
      limit: 8,
    });
    expect(result.selected).toHaveLength(0);
    expect(result.rejectedCounts).toMatchObject({ suppressed: 1, generic_inbox: 1, domain_mismatch: 1 });
  });

  it('selects distinct companies deterministically and enforces the visible cap', () => {
    const result = selectSavedApolloContacts({
      contacts: [
        contact({ id: 'b', email: 'zoe@northstarit.ca' }),
        contact({ id: 'a', email: 'amy@northstarit.ca' }),
        contact({ id: 'c', email: 'lee@secondit.ca', company: 'Second IT', companyDomain: 'secondit.ca', url: 'https://secondit.ca' }),
        contact({ id: 'd', email: 'max@thirdit.ca', company: 'Third IT', companyDomain: 'thirdit.ca', url: 'https://thirdit.ca' }),
      ],
      evidence: emptyEvidence,
      limit: 2,
    });
    expect(result.selected.map((item) => item.id)).toEqual(['a', 'c']);
    expect(result.rejectedCounts).toMatchObject({ duplicate_company: 1, over_limit: 1 });
  });
});
