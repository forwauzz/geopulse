import type { LongWaitConfig } from '@/components/long-wait-provider';

const sharedAuditAssemblySteps = [
  'Checking the request',
  'Reviewing the page',
  'Compiling audit status',
] as const;

export const scanLoadingJourney: LongWaitConfig = {
  title: 'Audit status',
  description: 'We are checking the request, reviewing the page, and compiling the first audit status.',
  steps: sharedAuditAssemblySteps,
};

export const resultsLoadingJourney: LongWaitConfig = {
  title: 'Audit status',
  description: 'We are pulling the saved scan, score, and current audit stage for this results page.',
  steps: ['Loading saved scan data', 'Checking current audit stage', 'Preparing the results view'],
};

export const saveResultsLoadingJourney: LongWaitConfig = {
  title: 'Saving your results',
  description: 'We are validating your details and attaching this scan to your email.',
  steps: ['Checking the submission', 'Saving your email and scan', 'Preparing confirmation'],
};

export const checkoutLoadingJourney: LongWaitConfig = {
  title: 'Preparing secure checkout',
  description: 'We are verifying the request, creating the Stripe session, and getting you to payment.',
  steps: ['Verifying the request', 'Creating the checkout session', 'Redirecting to secure payment'],
};

export const pricingCheckoutWaitJourney: LongWaitConfig = {
  title: 'Preparing secure checkout',
  description: 'We are getting your Stripe payment screen ready.',
  steps: ['Opening secure payment'],
};

export const loginLoadingJourney: LongWaitConfig = {
  title: 'Sending your sign-in link',
  description: 'We are creating a secure login link and handing it off to your inbox.',
  steps: ['Validating your email', 'Creating the sign-in link', 'Sending the login email'],
};

export const adminLoginLoadingJourney: LongWaitConfig = {
  title: 'Signing you into admin',
  description: 'We are checking your credentials and preparing the admin dashboard handoff.',
  steps: ['Verifying credentials', 'Checking admin access', 'Redirecting to the dashboard'],
};

export const reportLoadingJourney: LongWaitConfig = {
  title: 'Audit status',
  description: 'We are using the same audit pipeline as the preview, then finishing the full report and delivery steps.',
  steps: ['Checking payment status', 'Assembling the full audit', 'Preparing report delivery'],
};
