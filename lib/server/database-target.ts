/**
 * Which database is a script about to write to?
 *
 * Every write script resolves its target from `NEXT_PUBLIC_SUPABASE_URL`, which a shell, an
 * `.env.local`, a `--env-file` flag, or an npm script can all set — and the last one to win is
 * not always the one the operator had in mind. For a script that writes hundreds of real contact
 * rows, "I thought it was pointed at local" is not a recoverable mistake.
 *
 * VCI-8 holds production contact writes until QA. This makes that hold structural: a non-local
 * target has to be named explicitly, so the first production import is a deliberate act rather
 * than an inherited environment variable.
 */

export type DatabaseTarget = {
  readonly host: string;
  readonly isLocal: boolean;
};

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', 'host.docker.internal']);

/**
 * Local means loopback or the Docker host alias — nothing else. Deliberately not a substring or
 * suffix match: `localhost.attacker.com` and `my-localhost-db.supabase.co` are remote hosts, and
 * a looser check is how a "safe" guard waves through the one case it existed to catch.
 */
export function resolveDatabaseTarget(url: string): DatabaseTarget {
  try {
    const parsed = new URL(url);
    return { host: parsed.host, isLocal: LOCAL_HOSTNAMES.has(parsed.hostname.toLowerCase()) };
  } catch {
    // An unparseable URL is not evidence of anything, least of all safety.
    return { host: 'unparseable', isLocal: false };
  }
}
