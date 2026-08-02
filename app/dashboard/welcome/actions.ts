'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  confirmOrganizationOnboarding,
  type ValueFirstOnboardingActionState,
} from '@/lib/intelligence/value-first-onboarding';
import { recordActivationEvent } from '@/lib/server/activation-events';
import { ensureFreeVisibilityWorkspace } from '@/lib/server/customer-visibility-baseline';
import { persistConfirmedOrganizationContext } from '@/lib/server/organization-context-repository';
import { resolveValueFirstOnboardingProposal } from '@/lib/server/value-first-onboarding';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

const schema = z.object({
  intent: z.enum(['business', 'agency']),
  name: z.string().trim().min(1).max(120),
  website: z.string().trim().min(1).max(240),
  confirmed: z.literal('1').optional(),
  displayName: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  countryCode: z.string().trim().max(80).optional(),
  subdivisionCode: z.string().trim().max(8).optional(),
  locality: z.string().trim().max(120).optional(),
  marketScope: z.enum(['local', 'regional', 'national', 'online', 'global']).optional(),
  languages: z.string().trim().max(160).optional(),
  timezone: z.string().trim().max(80).optional(),
  bundle: z.enum(['startup_dev', 'agency_core', 'agency_pro']).optional(),
  autosubscribe: z.literal('1').optional(),
  qaToken: z.string().trim().max(160).optional(),
});

export async function completeWelcome(
  _previous: ValueFirstOnboardingActionState | null,
  formData: FormData,
): Promise<ValueFirstOnboardingActionState> {
  const parsed = schema.safeParse({
    intent: formData.get('intent'),
    name: formData.get('name'),
    website: formData.get('website'),
    confirmed: formData.get('confirmed') || undefined,
    displayName: formData.get('displayName') || undefined,
    category: formData.get('category') || undefined,
    countryCode: formData.get('countryCode') || undefined,
    subdivisionCode: formData.get('subdivisionCode') || undefined,
    locality: formData.get('locality') || undefined,
    marketScope: formData.get('marketScope') || undefined,
    languages: formData.get('languages') || undefined,
    timezone: formData.get('timezone') || undefined,
    bundle: formData.get('bundle') || undefined,
    autosubscribe: formData.get('autosubscribe') || undefined,
    qaToken: formData.get('qa_token') || undefined,
  });
  if (!parsed.success) {
    return { status: 'error', message: 'Enter a business name and public website to continue.' };
  }
  const detected = await resolveValueFirstOnboardingProposal({
    intent: parsed.data.intent,
    name: parsed.data.name,
    website: parsed.data.website,
  });
  if (!detected.ok) {
    return {
      status: 'error',
      message: detected.message,
      draft: { intent: parsed.data.intent, name: parsed.data.name, website: parsed.data.website },
    };
  }
  if (parsed.data.confirmed !== '1') {
    return {
      status: 'needs_confirmation',
      proposal: detected.proposal,
      message: 'Confirm the detected business and market.',
    };
  }
  const confirmation = confirmOrganizationOnboarding(detected.proposal, parsed.data);
  if (!confirmation.ok) {
    return {
      status: 'needs_confirmation',
      proposal: { ...detected.proposal, missingFields: confirmation.missingFields },
      message: 'Answer the remaining question before the first baseline is built.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/welcome');
  const confirmed = confirmation.value;
  const completedAt = new Date().toISOString();
  const { error } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      gp_onboarding_v1: {
        role: confirmed.intent,
        goal: confirmed.intent === 'agency' ? 'reports' : 'visibility',
        website: confirmed.submittedWebsite,
        completed_at: completedAt,
      },
      gp_organization_confirmation_v1: {
        display_name: confirmed.displayName,
        canonical_domain: confirmed.canonicalDomain,
        category: confirmed.category,
        market_scope: confirmed.marketScope,
        country_code: confirmed.countryCode,
        subdivision_code: confirmed.subdivisionCode,
        locality: confirmed.locality,
        languages: confirmed.languages,
        timezone: confirmed.timezone,
        confirmed_at: completedAt,
      },
    },
  });
  if (error) {
    return { status: 'error', message: 'We could not save that confirmation. Please try again.' };
  }

  if (confirmed.intent === 'business' && !parsed.data.bundle) {
    const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
    const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!url || !key) {
      return { status: 'error', message: 'The workspace is temporarily unavailable. Your confirmation is saved; try again shortly.' };
    }
    const admin = createServiceRoleClient(url, key);
    const workspace = await ensureFreeVisibilityWorkspace({
      supabase: admin,
      userId: user.id,
      userEmail: user.email,
      domain: confirmed.canonicalDomain,
      companyName: confirmed.displayName,
      persistOrganizationContext: persistConfirmedOrganizationContext,
      confirmedOrganization: {
        actorId: user.id,
        canonicalDomain: confirmed.canonicalDomain,
        displayName: confirmed.displayName,
        category: confirmed.category,
        services: confirmed.services,
        buyer: confirmed.buyer,
        marketScope: confirmed.marketScope,
        countryCode: confirmed.countryCode,
        subdivisionCode: confirmed.subdivisionCode,
        locality: confirmed.locality,
        serviceAreas: confirmed.serviceAreas,
        languages: confirmed.languages,
        timezone: confirmed.timezone,
        approvedCompetitorDomains: [],
        source: 'direct_business_value_first_onboarding',
      },
    });
    if (!workspace.ok) {
      return { status: 'error', message: 'Your business is confirmed, but the first baseline could not start yet. Try again to resume safely.' };
    }
    if (workspace.baseline.ok) {
      await recordActivationEvent({
        supabase: admin,
        eventName: 'business_activation_started',
        userId: user.id,
        ownerId: workspace.workspaceId,
        canonicalDomain: confirmed.canonicalDomain,
        contextVersion: workspace.organizationContextVersion ?? 'confirmed',
      });
    }
    redirect('/dashboard?onboarding=first-value');
  }

  if (parsed.data.bundle && parsed.data.autosubscribe === '1') {
    const params = new URLSearchParams({
      bundle: parsed.data.bundle,
      autosubscribe: '1',
      organization_name: confirmed.displayName,
      website_url: confirmed.submittedWebsite,
    });
    if (parsed.data.qaToken) params.set('qa_token', parsed.data.qaToken);
    redirect(`/pricing?${params.toString()}`);
  }
  if (confirmed.intent === 'agency') {
    const params = new URLSearchParams({
      bundle: 'agency_core',
      organization_name: confirmed.displayName,
      website_url: confirmed.submittedWebsite,
    });
    redirect(`/pricing?${params.toString()}`);
  }
  redirect('/dashboard?onboarding=first-value');
}
