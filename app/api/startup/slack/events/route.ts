import { getScanApiEnv } from '@/lib/server/cf-env';
import { handleStartupSlackEvent } from '@/lib/server/startup-slack-bot';

export async function POST(request: Request) {
  const env = await getScanApiEnv();
  const body = await request.text();
  return handleStartupSlackEvent({
    body,
    env,
    headers: request.headers,
  });
}
