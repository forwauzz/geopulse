import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieRow = { name: string; value: string; options: CookieOptions };

/**
 * Supabase browser-safe session for Server Components, Server Actions, Route Handlers.
 * Uses anon key only — never service_role.
 */
export async function createSupabaseServerClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const anon = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  const cookieStore = await cookies();

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
