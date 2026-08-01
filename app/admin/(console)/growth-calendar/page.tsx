import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { loadGrowthCalendar } from '@/lib/server/growth-calendar';
import { GrowthCalendarClient } from './growth-calendar-client';

export const dynamic = 'force-dynamic';

export default async function GrowthCalendarPage() {
  const context = await loadAdminPageContext('/admin/growth-calendar');
  if (!context.ok) return <p className="text-error">{context.message}</p>;

  const data = await loadGrowthCalendar(context.adminDb);
  return <GrowthCalendarClient data={data} />;
}
