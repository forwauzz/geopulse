import { ImageResponse } from 'next/og';
import { getScanForPublicShare } from '@/lib/server/get-scan-for-public-share';
import { getScanApiEnv } from '@/lib/server/cf-env';

export const runtime = 'nodejs';
export const alt = 'GEO-Pulse AI Search Readiness';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const ink = '#2c3435';
const primary = '#565e74';
const mist = '#586162';
const surface = '#f8f9f9';

function truncateUrl(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let headline = 'AI Search Readiness';
  let subline = 'GEO-Pulse';
  let scoreBlock = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,
      }}
    >
      <span style={{ fontSize: 28, color: mist, fontWeight: 500 }}>Run a free scan at your site</span>
    </div>
  );

  try {
    const env = await getScanApiEnv();
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      const result = await getScanForPublicShare(
        id,
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      if (result.ok) {
        const { url, score, letterGrade } = result.data;
        headline = 'AI Search Readiness Score';
        subline = truncateUrl(url, 72);
        const scoreText = score != null ? String(score) : '—';
        const gradeText = letterGrade ?? '—';
        scoreBlock = (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: 32,
              marginTop: 16,
            }}
          >
            <span style={{ fontSize: 120, fontWeight: 800, color: primary, lineHeight: 1 }}>{scoreText}</span>
            <span style={{ fontSize: 56, fontWeight: 700, color: ink }}>{gradeText}</span>
          </div>
        );
      }
    }
  } catch {
    // Generic branded image — no score
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: 64,
          background: surface,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            maxWidth: 1000,
          }}
        >
          <span style={{ fontSize: 24, color: mist, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase' }}>
            {headline}
          </span>
          <span style={{ fontSize: 36, color: ink, fontWeight: 600, lineHeight: 1.25 }}>{subline}</span>
          {scoreBlock}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            right: 64,
            fontSize: 22,
            color: mist,
            fontWeight: 500,
          }}
        >
          geopulse.io
        </div>
      </div>
    ),
    { ...size }
  );
}
