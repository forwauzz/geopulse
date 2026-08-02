import 'server-only';

import {
  buildOrganizationOnboardingProposal,
  type OnboardingIntent,
  type OrganizationOnboardingProposal,
} from '@/lib/intelligence/value-first-onboarding';
import { resolveOrganizationWebsite } from './organization-resolver';

export type ResolveValueFirstProposalResult =
  | { readonly ok: true; readonly proposal: OrganizationOnboardingProposal }
  | { readonly ok: false; readonly message: string };

export async function resolveValueFirstOnboardingProposal(args: {
  readonly intent: OnboardingIntent;
  readonly name: string;
  readonly website: string;
}): Promise<ResolveValueFirstProposalResult> {
  const result = await resolveOrganizationWebsite({ url: args.website });
  if (!result.ok) {
    return {
      ok: false,
      message: result.reason.includes('blocked_private_target')
        ? 'Use a public business website, not a private or local address.'
        : 'We could not read that website yet. Check the address and try again.',
    };
  }
  return {
    ok: true,
    proposal: buildOrganizationOnboardingProposal({
      intent: args.intent,
      submittedName: args.name,
      submittedWebsite: args.website,
      resolution: result.resolution,
    }),
  };
}
