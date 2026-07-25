import { IntelligenceEvidenceView, IntelligencePageFrame } from '@/components/intelligence-admin-view';
import { createIntelligenceAdminData } from '@/lib/intelligence/admin-data';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{ sourceKind?: string; sourceId?: string }>;
};

export default async function AdminIntelligenceEvidencePage({ searchParams }: Props) {
  const filters = (await searchParams) ?? {};
  const context = await loadAdminPageContext('/admin/intelligence/evidence');
  const result = context.ok
    ? await createIntelligenceAdminData(context.adminDb).getEvidence(filters)
    : { status: 'error' as const, data: [], message: context.message };
  return (
    <IntelligencePageFrame
      title="Evidence lineage"
      description="Metadata-only provenance for original, extracted, parsed, computed, and generated evidence. Raw content and artifact URLs are not rendered here."
      status={result.status}
      message={result.message}
    >
      <IntelligenceEvidenceView rows={result.data} />
    </IntelligencePageFrame>
  );
}
