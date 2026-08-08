import { describe, expect, it } from 'vitest';
import { summarizeEmailCampaignSegments } from './email-campaign-console';

describe('email campaign composer segment summaries', () => {
  it('shows eligibility and sequence truth without exposing contact rows', () => {
    expect(summarizeEmailCampaignSegments([
      { segment: 'msp-qc', eligibility_status: 'eligible', added_to_sequence_at: null },
      { segment: 'msp-qc', eligibility_status: 'needs_verification', added_to_sequence_at: null },
      { segment: 'msp-qc', eligibility_status: 'rejected', added_to_sequence_at: null },
      { segment: 'msp-qc', eligibility_status: 'suppressed', added_to_sequence_at: '2026-08-01T00:00:00.000Z' },
      { segment: 'msp-qc', eligibility_status: 'eligible', added_to_sequence_at: '2026-08-02T00:00:00.000Z' },
      { segment: 'marketing-agencies', eligibility_status: 'converted', added_to_sequence_at: null },
      { segment: '', eligibility_status: 'eligible', added_to_sequence_at: null },
    ])).toEqual([
      {
        segment: 'marketing-agencies',
        total: 1,
        eligible: 0,
        needsVerification: 0,
        excluded: 1,
        inSequence: 0,
      },
      {
        segment: 'msp-qc',
        total: 5,
        eligible: 2,
        needsVerification: 1,
        excluded: 2,
        inSequence: 2,
      },
    ]);
  });
});
