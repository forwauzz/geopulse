'use client';

import { useEffect, useState } from 'react';
import { EmailGate } from '@/components/email-gate';
import { ScoreDisplay } from '@/components/score-display';

type Issue = { check?: string; finding?: string; fix?: string; weight?: number };

type Props = { scanId: string; turnstileSiteKey: string };

export function ResultsView({ scanId, turnstileSiteKey }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    scanId: string;
    url: string;
    score: number;
    letterGrade: string;
    topIssues: Issue[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/scans/${scanId}`, { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setError(res.status === 404 ? 'not_found' : 'load_failed');
          return;
        }
        const j = (await res.json()) as {
          scanId: string;
          url: string;
          score: number | null;
          letterGrade: string | null;
          topIssues: Issue[];
        };
        if (!cancelled) {
          setData({
            scanId: j.scanId,
            url: j.url,
            score: j.score ?? 0,
            letterGrade: j.letterGrade ?? '—',
            topIssues: Array.isArray(j.topIssues) ? j.topIssues : [],
          });
        }
      } catch {
        if (!cancelled) setError('network');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scanId]);

  if (loading) {
    return <p className="text-geo-mist">Loading results…</p>;
  }
  if (error === 'not_found') {
    return <h1 className="text-2xl font-bold">Scan not found</h1>;
  }
  if (error || !data) {
    return <h1 className="text-2xl font-bold">Could not load results</h1>;
  }

  return (
    <>
      <div>
        <p className="text-sm text-geo-mist">Results for</p>
        <p className="mt-1 break-all text-lg font-medium text-geo-ink">{data.url}</p>
      </div>
      <ScoreDisplay score={data.score} letterGrade={data.letterGrade} issues={data.topIssues} />
      {turnstileSiteKey ? (
        <EmailGate
          siteKey={turnstileSiteKey}
          scanId={data.scanId}
          url={data.url}
          score={data.score}
        />
      ) : null}
    </>
  );
}
