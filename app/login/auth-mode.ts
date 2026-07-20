/**
 * Which form `/login` shows: the free sign-up, or sign-in for a returning user.
 *
 * `?next=` is the tell. Middleware only appends it when it bounces someone off a protected page
 * (`/dashboard`, ...), and you cannot have been on a protected page without an account — so that
 * visitor is returning and wants sign-in. Marketing CTAs link to a bare `/login` and still get the
 * free sign-up, which is the behaviour #24 intended.
 *
 * Before this, `/login` defaulted to sign-up for everyone: a returning user whose session expired
 * was bounced from the dashboard straight into "Sign up for free", with sign-in reachable only via
 * an "Already have an account?" link they had to notice.
 *
 * An explicit `?mode=` always wins, so existing links keep working.
 */
export function resolveAuthMode(params: {
  mode?: string | undefined;
  next?: string | undefined;
}): 'signup' | 'signin' {
  if (params.mode) return params.mode === 'signin' ? 'signin' : 'signup';
  return params.next ? 'signin' : 'signup';
}
