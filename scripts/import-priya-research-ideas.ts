import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { runAgentLoopControl } from '../lib/server/agent-loop-control';
import {
  upsertPriyaResearchIdeas,
  type PriyaResearchIdea,
} from '../lib/server/priya-research-ideas';

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  const filePath = path.join(process.cwd(), 'data', 'priya-research-2026-07-27.json');
  const ideas = JSON.parse(await fs.readFile(filePath, 'utf8')) as PriyaResearchIdea[];
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const saved = await upsertPriyaResearchIdeas(db, ideas);
  const loops = await runAgentLoopControl({ db, seoBatch: 30 });
  console.log(JSON.stringify({ saved, imported: ideas.length, loops }, null, 2));
}

void main();
