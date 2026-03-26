export type ResultsJourneyStatus = 'none' | 'generating' | 'delivered';

export type ResultsJourneyStep = {
  label: string;
  detail: string;
  state: 'complete' | 'current' | 'upcoming';
};

export type ResultsJourneyModel = {
  activeStepIndex: number;
  statusTitle: string;
  statusBody: string;
  statusTone: 'neutral' | 'success' | 'warning';
  steps: ResultsJourneyStep[];
};

type BuildResultsJourneyInput = {
  host: string;
  hasPaidReport: boolean;
  reportStatus: ResultsJourneyStatus;
  checkoutState?: string | null;
};

export function buildResultsJourneyModel({
  host,
  hasPaidReport,
  reportStatus,
  checkoutState,
}: BuildResultsJourneyInput): ResultsJourneyModel {
  let activeStepIndex = 1;
  if (reportStatus === 'delivered') activeStepIndex = 4;
  else if (reportStatus === 'generating') activeStepIndex = 3;
  else if (hasPaidReport) activeStepIndex = 2;

  const steps: ResultsJourneyStep[] = [
    {
      label: 'Preview ready',
      detail: `You already have the first audit view for ${host}.`,
      state: activeStepIndex > 1 ? 'complete' : activeStepIndex === 1 ? 'current' : 'upcoming',
    },
    {
      label: 'Choose your next step',
      detail: 'Continue to the paid full audit, or subtly save this preview for later.',
      state: activeStepIndex > 2 ? 'complete' : activeStepIndex === 2 ? 'current' : 'upcoming',
    },
    {
      label: 'Full audit in progress',
      detail: 'After payment, we confirm the purchase and build the longer report.',
      state: activeStepIndex > 3 ? 'complete' : activeStepIndex === 3 ? 'current' : 'upcoming',
    },
    {
      label: 'Report delivered',
      detail: 'The finished report is emailed to the address collected in Stripe checkout.',
      state: activeStepIndex > 4 ? 'complete' : activeStepIndex === 4 ? 'current' : 'upcoming',
    },
  ];

  let statusTitle = 'Preview ready';
  let statusBody =
    'Review the first audit view below, then continue to the full audit if you want the complete breakdown and action plan.';
  let statusTone: 'neutral' | 'success' | 'warning' = 'neutral';

  if (checkoutState === 'cancel' && reportStatus === 'none') {
    statusTitle = 'Checkout cancelled';
    statusBody =
      'No charge was made. Your preview is still here when you are ready to continue to the full audit.';
    statusTone = 'warning';
  } else if (checkoutState === 'success' && reportStatus === 'none') {
    statusTitle = 'Payment return detected';
    statusBody =
      'You are back from checkout. We are waiting for payment confirmation before we start the full audit. If this screen does not update shortly, refresh once.';
  } else if (reportStatus === 'generating') {
    statusTitle = 'Full audit in progress';
    statusBody =
      'Payment is confirmed. We are expanding the preview into the full audit now and will email the finished report to your Stripe checkout address.';
  } else if (reportStatus === 'delivered') {
    statusTitle = 'Report delivered';
    statusBody =
      'Your full audit is ready. We emailed the report to your Stripe checkout address and also unlocked direct access below.';
    statusTone = 'success';
  }

  return { activeStepIndex, statusTitle, statusBody, statusTone, steps };
}
