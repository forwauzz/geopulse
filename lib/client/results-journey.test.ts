import { describe, expect, it } from 'vitest';
import { buildResultsJourneyModel } from '@/lib/client/results-journey';

describe('buildResultsJourneyModel', () => {
  const host = 'example.com';

  it('keeps preview as the current step before payment', () => {
    const journey = buildResultsJourneyModel({
      host,
      hasPaidReport: false,
      reportStatus: 'none',
      checkoutState: null,
      hasDirectReportAccess: false,
    });

    expect(journey.statusTitle).toBe('Preview ready');
    expect(journey.statusTone).toBe('neutral');
    expect(journey.steps[0]?.state).toBe('current');
    expect(journey.steps[1]?.state).toBe('upcoming');
  });

  it('shows a warning state when checkout is cancelled', () => {
    const journey = buildResultsJourneyModel({
      host,
      hasPaidReport: false,
      reportStatus: 'none',
      checkoutState: 'cancel',
      hasDirectReportAccess: false,
    });

    expect(journey.statusTitle).toBe('Checkout cancelled');
    expect(journey.statusTone).toBe('warning');
  });

  it('shows a pending confirmation state after returning from checkout', () => {
    const journey = buildResultsJourneyModel({
      host,
      hasPaidReport: false,
      reportStatus: 'none',
      checkoutState: 'success',
      hasDirectReportAccess: false,
    });

    expect(journey.statusTitle).toBe('Payment return detected');
    expect(journey.statusBody).toContain('waiting for payment confirmation');
  });

  it('marks the full audit as in progress once payment is confirmed', () => {
    const journey = buildResultsJourneyModel({
      host,
      hasPaidReport: true,
      reportStatus: 'generating',
      checkoutState: 'success',
      hasDirectReportAccess: false,
    });

    expect(journey.activeStepIndex).toBe(3);
    expect(journey.statusTitle).toBe('Full audit in progress');
    expect(journey.steps[2]?.state).toBe('current');
    expect(journey.steps[0]?.state).toBe('complete');
  });

  it('marks delivery as complete once the report is available', () => {
    const journey = buildResultsJourneyModel({
      host,
      hasPaidReport: true,
      reportStatus: 'delivered',
      checkoutState: 'success',
      hasDirectReportAccess: true,
    });

    expect(journey.activeStepIndex).toBe(4);
    expect(journey.statusTitle).toBe('Report delivered');
    expect(journey.statusTone).toBe('success');
    expect(journey.steps[3]?.state).toBe('current');
  });

  it('does not promise direct links when the report is email-only', () => {
    const journey = buildResultsJourneyModel({
      host,
      hasPaidReport: true,
      reportStatus: 'delivered',
      checkoutState: 'success',
      hasDirectReportAccess: false,
    });

    expect(journey.statusBody).not.toContain('unlocked direct access below');
  });
});
