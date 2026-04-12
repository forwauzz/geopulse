export function resolvePostSignupRedirect(args: {
  readonly nextParam: string | null;
  readonly bundleParam: string | null;
  readonly isNewUser: boolean;
  readonly organizationName?: string | null;
  readonly websiteUrl?: string | null;
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
    return `/pricing?${params.toString()}`;
  }

  if (args.isNewUser && !args.nextParam) {
    return '/pricing?onboarding=1';
  }

  return null;
}

export function buildBillingSubscribeSuccessUrl(args: {
  readonly baseUrl: string;
  readonly bundleKey: string;
}): string {
  return `${args.baseUrl.replace(/\/$/, '')}/dashboard?onboarded=true&bundle=${encodeURIComponent(args.bundleKey)}`;
}
