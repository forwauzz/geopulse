import { IntelligenceLanesView, IntelligencePageFrame } from '@/components/intelligence-admin-view';
import { createIntelligenceAdminData } from '@/lib/intelligence/admin-data';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';

export const dynamic = 'force-dynamic';

export default async function AdminIntelligenceLanesPage() {
  const context = await loadAdminPageContext('/admin/intelligence/lanes');
  const result = context.ok
    ? await createIntelligenceAdminData(context.adminDb).getLanes()
    : { status: 'error' as const, data: [], message: context.message };
  return (
    <IntelligencePageFrame
      title="Measurement lanes"
      description="Provider, model, run mode, prompt, parser, and metric contracts. Versions must match before a comparison is considered safe."
      status={result.status}
      message={result.message}
    >
      <IntelligenceLanesView rows={result.data} />
    </IntelligencePageFrame>
  );
}
