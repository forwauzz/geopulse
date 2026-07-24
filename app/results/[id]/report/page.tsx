import { ReportViewer } from '@/components/report-viewer';
import { ReportAttributionBeacon } from '@/components/report-attribution-beacon';

type Props = { params: Promise<{ id: string }> };

export default async function ReportPage({ params }: Props) {
  const { id } = await params;
  return (
    <>
      <ReportAttributionBeacon scanId={id} />
      <ReportViewer scanId={id} />
    </>
  );
}
