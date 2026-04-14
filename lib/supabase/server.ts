import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  buildE2ESupabaseServerClient,
  resolveE2EAuthUserFromCookieStore,
} from '@/lib/supabase/e2e-auth';

type CookieRow = { name: string; value: string; options: CookieOptions };

/**
 * Supabase browser-safe session for Server Components, Server Actions, Route Handlers.
 * Uses anon key only — never service_role.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const e2eUser = resolveE2EAuthUserFromCookieStore(cookieStore);
  if (e2eUser) {
    return buildE2ESupabaseServerClient(e2eUser) as any;
  }

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const anon = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieRow[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }: CookieRow) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // set from Server Component — middleware refreshes session
        }
      },
    },
  });
}
