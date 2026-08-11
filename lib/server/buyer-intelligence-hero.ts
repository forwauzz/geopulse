import { z } from 'zod';

const heroSchema = z.object({
  key: z.string().min(1).max(512),
  mime: z.enum(['image/png', 'image/jpeg']),
}).strict();

export type BuyerIntelligenceHeroRef = z.infer<typeof heroSchema>;

export function readBuyerIntelligenceHeroRef(metadata: unknown): BuyerIntelligenceHeroRef | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const parsed = heroSchema.safeParse((metadata as Record<string, unknown>)['buyer_intelligence_hero']);
  return parsed.success ? parsed.data : null;
}
