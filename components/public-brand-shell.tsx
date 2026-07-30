'use client';

import { usePathname } from 'next/navigation';
import { isPublicSiteRoute } from '@/lib/public-route';

export function PublicBrandShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const isPublicRoute = isPublicSiteRoute(pathname);
  return <div className={isPublicRoute ? 'public-brand flex-1' : 'flex-1'}>{children}</div>;
}
