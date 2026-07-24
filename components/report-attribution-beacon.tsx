'use client';

import { useEffect } from 'react';
import { getAttributionContext } from '@/lib/client/attribution';

export function ReportAttributionBeacon({ scanId }: { readonly scanId: string }) {
  useEffect(() => {
    const key = `gp_report_viewed:${scanId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      return;
    }

    void fetch('/api/attribution/report-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scan_id: scanId, ...getAttributionContext() }),
      keepalive: true,
    }).catch(() => {
      // Attribution is best-effort and must never interrupt the report.
    });
  }, [scanId]);

  return null;
}
