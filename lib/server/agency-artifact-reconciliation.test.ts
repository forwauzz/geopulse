import { describe, expect, it } from 'vitest';
import { planAgencyArtifactAssignments } from './agency-artifact-reconciliation';

describe('planAgencyArtifactAssignments', () => {
  it('links an unassigned historical scan and report by exact normalized client domain', () => {
    expect(
      planAgencyArtifactAssignments({
        clients: [
          { id: 'stability', agency_account_id: 'lifter', canonical_domain: 'stabilitylab.com' },
        ],
        domains: [
          { agency_client_id: 'stability', canonical_domain: 'www.stabilitylab.com' },
        ],
        scans: [
          { id: 'scan-1', agency_account_id: 'lifter', domain: 'https://www.stabilitylab.com/' },
        ],
        reports: [{ id: 'report-1', scan_id: 'scan-1' }],
      }),
    ).toEqual({
      scans: [{ recordId: 'scan-1', agencyClientId: 'stability' }],
      reports: [{ recordId: 'report-1', agencyClientId: 'stability' }],
    });
  });

  it('does not guess when a domain is ambiguous or belongs to another account', () => {
    expect(
      planAgencyArtifactAssignments({
        clients: [
          { id: 'client-a', agency_account_id: 'account-a', canonical_domain: 'shared.example' },
          { id: 'client-b', agency_account_id: 'account-b', canonical_domain: 'shared.example' },
        ],
        domains: [],
        scans: [
          { id: 'scan-ambiguous', agency_account_id: 'account-a', domain: 'shared.example' },
          { id: 'scan-unknown', agency_account_id: 'account-a', domain: 'unknown.example' },
        ],
        reports: [{ id: 'report-1', scan_id: 'scan-ambiguous' }],
      }),
    ).toEqual({ scans: [], reports: [] });
  });

  it('repairs a null report client when its scan was already assigned previously', () => {
    expect(
      planAgencyArtifactAssignments({
        clients: [
          { id: 'stability', agency_account_id: 'lifter', canonical_domain: 'stabilitylab.com' },
        ],
        domains: [],
        scans: [
          {
            id: 'scan-1',
            agency_account_id: 'lifter',
            agency_client_id: 'stability',
            domain: 'stabilitylab.com',
          },
        ],
        reports: [{ id: 'report-1', scan_id: 'scan-1' }],
      }),
    ).toEqual({
      scans: [],
      reports: [{ recordId: 'report-1', agencyClientId: 'stability' }],
    });
  });
});
