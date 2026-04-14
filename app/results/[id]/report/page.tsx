import { ReportViewer } from '@/components/report-viewer';

type Props = { params: Promise<{ id: string }> };

export default async function ReportPage({ params }: Props) {
  const { id } = await params;
  return <ReportViewer scanId={id} />;
}
