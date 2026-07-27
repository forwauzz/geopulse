import { ReportViewer } from '@/components/report-viewer';
import { ReportAttributionBeacon } from '@/components/report-attribution-beacon';
import { loadUiFlags } from '@/lib/server/app-ui-flags';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTurnstileSiteKey } from '@/lib/turnstile-site-key';
import { scanCanShowStandaloneMonitoringOffer } from '@/lib/server/scan-monitoring-offer';

type Props = { params: Promise<{ id: string }> };

export default async function ReportPage({ params }: Props) {
  const { id } = await params;
  const [uiFlags, supabase] = await Promise.all([
    loadUiFlags(),
    createSupabaseServerClient(),
  ]);
  const { data: { user } } = await supabase.auth.getUser();
  const standaloneMonitoringEligible = uiFlags.show_monitor_subscription
    ? await scanCanShowStandaloneMonitoringOffer(id)
    : false;
  return (
    <>
      <ReportAttributionBeacon scanId={id} />
      <ReportViewer
        scanId={id}
        showMonitorSubscription={uiFlags.show_monitor_subscription && standaloneMonitoringEligible}
        turnstileSiteKey={getTurnstileSiteKey()}
        monitorAccountEmail={user?.email ?? null}
      />
    </>
  );
}
