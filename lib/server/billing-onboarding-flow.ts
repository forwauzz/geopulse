export function resolvePostSignupRedirect(args: {
  readonly nextParam: string | null;
  readonly bundleParam: string | null;
  readonly isNewUser: boolean;
}): string | null {
  if (args.bundleParam && args.nextParam === '/pricing') {
    return `/pricing?bundle=${encodeURIComponent(args.bundleParam)}&autosubscribe=1`;
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
