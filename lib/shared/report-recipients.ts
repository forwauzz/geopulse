import { z } from 'zod';

const emailSchema = z.string().trim().email().max(320);

export function parseReportRecipients(raw: string, limit = 5): string[] {
  const recipients: string[] = [];
  for (const candidate of raw.split(/[\s,;]+/)) {
    const email = candidate.trim().toLowerCase();
    if (!email || !emailSchema.safeParse(email).success || recipients.includes(email)) continue;
    recipients.push(email);
    if (recipients.length >= limit) break;
  }
  return recipients;
}

export function recipientsFromMetadata(
  reportEmail: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): string[] {
  const stored = metadata?.['report_recipients'];
  const raw = Array.isArray(stored)
    ? stored.filter((value): value is string => typeof value === 'string').join(',')
    : '';
  return parseReportRecipients([reportEmail ?? '', raw].join(','));
}
