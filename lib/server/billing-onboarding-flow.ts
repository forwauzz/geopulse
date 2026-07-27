export function resolvePostSignupRedirect(args: {
  readonly nextParam: string | null;
  readonly bundleParam: string | null;
  readonly isNewUser: boolean;
  readonly organizationName?: string | null;
  readonly websiteUrl?: string | null;
  readonly qaToken?: string | null;
}): string | null {
  if (args.bundleParam && args.nextParam === '/pricing') {
    const params = new URLSearchParams();
    params.set('bundle', args.bundleParam);
    params.set('autosubscribe', '1');
    if (args.organizationName?.trim()) {
      params.set('organization_name', args.organizationName.trim());
    }
    if (args.websiteUrl?.trim()) {
      params.set('website_url', args.websiteUrl.trim());
    }
    if (args.qaToken?.trim()) {
      params.set('qa_token', args.qaToken.trim());
    }
    // A paid buyer still needs a persona + goal before workspace provisioning can
    // succeed. Keep the selected plan through that short step, then continue to
    // checkout. Sending a brand-new user straight to Stripe created a race between
    // auth cookies, onboarding recovery, and the checkout request.
    return `${args.isNewUser ? '/dashboard/welcome' : '/pricing'}?${params.toString()}`;
  }

  if (args.isNewUser && !args.nextParam) {
    return '/dashboard/welcome';
  }

  return null;
}

export function buildBillingSubscribeSuccessUrl(args: {
  readonly baseUrl: string;
  readonly bundleKey: string;
}): string {
  return `${args.baseUrl.replace(/\/$/, '')}/dashboard?onboarded=true&bundle=${encodeURIComponent(args.bundleKey)}`;
}
