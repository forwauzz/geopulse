import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.fn();
const loadAdminActionContext = vi.fn();
const enqueueLifecycleEmail = vi.fn();
const eventInsert = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/server/admin-runtime', () => ({ loadAdminActionContext }));
vi.mock('@/lib/server/lifecycle-email', () => ({ enqueueLifecycleEmail }));

describe('lifecycle email admin actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const deliveryQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          event_type: 'payment_failed',
          template_key: 'payment_failed',
          recipient_email: 'buyer@example.com',
          variables: { cta_url: 'https://getgeopulse.com/dashboard/billing' },
          user_id: 'user-1',
          subject_id: 'sub-1',
        },
      }),
    };
    const adminDb = {
      from: vi.fn((table: string) => table === 'lifecycle_email_deliveries'
        ? deliveryQuery
        : { insert: eventInsert.mockResolvedValue({ error: null }) }),
    };
    loadAdminActionContext.mockResolvedValue({ ok: true, adminDb, user: { id: 'admin-1' } });
    enqueueLifecycleEmail.mockResolvedValue({ ok: true, id: 'new-delivery', status: 'queued' });
  });

  it('creates a new idempotent delivery instead of mutating historical evidence', async () => {
    const { resendLifecycleDelivery } = await import('./actions');
    const form = new FormData();
    form.set('delivery_id', 'old-delivery');

    await resendLifecycleDelivery(form);

    expect(enqueueLifecycleEmail).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: expect.stringMatching(/^operator-resend\/old-delivery\//),
      templateKey: 'payment_failed',
      to: 'buyer@example.com',
      userId: 'user-1',
      subjectId: 'sub-1',
    }));
    expect(eventInsert).toHaveBeenCalledWith(expect.objectContaining({
      delivery_id: 'old-delivery',
      event_type: 'operator_resend_requested',
      detail: expect.objectContaining({ new_delivery_id: 'new-delivery' }),
    }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/lifecycle-email');
  });
});
