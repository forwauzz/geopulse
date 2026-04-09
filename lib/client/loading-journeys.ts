import type { LongWaitConfig } from '@/components/long-wait-provider';

const sharedAuditAssemblySteps = [
  'Checking the website request',
  'Reviewing the site content',
  'Assembling the audit view',
] as const;

export const scanLoadingJourney: LongWaitConfig = {
  title: 'Building your first audit view',
  description: 'We are checking the request, reviewing the page safely, and drafting the preview you will see first.',
  steps: sharedAuditAssemblySteps,
};

export const resultsLoadingJourney: LongWaitConfig = {
  title: 'Loading your audit progress',
  description: 'We are pulling the saved scan, score, and current audit stage for this results page.',
  steps: ['Loading saved scan data', 'Checking current audit status', 'Preparing the results view'],
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
  title: 'Building your full audit',
  description: 'We are using the same audit pipeline as the preview, then finishing the full report and delivery steps.',
  steps: ['Checking payment and report status', 'Assembling the complete audit', 'Preparing email and report access'],
};
