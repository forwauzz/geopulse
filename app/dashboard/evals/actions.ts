'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';

const judgmentSchema = z.object({
  evalRunId: z.string().uuid('Invalid eval run id.'),
  judgment: z.enum(['better', 'worse', 'unclear']),
  returnPath: z.string().min(1).max(500),
});

export async function setReportEvalJudgment(formData: FormData): Promise<void> {
  const context = await loadAdminActionContext();
  if (!context.ok) {
    throw new Error(context.message);
  }

  const parsed = judgmentSchema.safeParse({
    evalRunId: formData.get('evalRunId'),
    judgment: formData.get('judgment'),
    returnPath: formData.get('returnPath'),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid judgment payload.');
  }

  const { adminDb } = context;
  const { data: existing, error: loadError } = await adminDb
    .from('report_eval_runs')
    .select('metadata')
    .eq('id', parsed.data.evalRunId)
    .maybeSingle();

  if (loadError || !existing) {
    throw new Error(loadError?.message ?? 'Could not load report eval run.');
  }

  const currentMetadata =
    existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};

  const nextMetadata = {
    ...currentMetadata,
    operator_rewrite_judgment: parsed.data.judgment,
    operator_rewrite_judged_at: new Date().toISOString(),
    operator_rewrite_judged_by: context.user.email ?? null,
  };

  const { error: updateError } = await adminDb
    .from('report_eval_runs')
    .update({ metadata: nextMetadata })
    .eq('id', parsed.data.evalRunId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath(parsed.data.returnPath);
  revalidatePath('/dashboard/evals');
}
