import { describe, expect, it } from 'vitest';
import { createContentDestinationAdminData } from './content-destination-admin-data';

describe('createContentDestinationAdminData', () => {
  it('returns destinations with metadata normalized', async () => {
    const supabase = {
      from(table: string) {
        expect(table).toBe('content_distribution_destinations');
        let orderCalls = 0;
        return {
          select() {
            return this;
          },
          order() {
            orderCalls += 1;
            if (orderCalls === 1) return this;
            return Promise.resolve({
              data: [
                {
                  id: 'dest-1',
                  destination_key: 'kit_newsletter',
                  destination_type: 'newsletter',
                  provider_name: 'kit',
                  display_name: 'Kit',
                  enabled: false,
                  is_default: false,
                  requires_paid_plan: true,
                  supports_api_publish: true,
                  supports_scheduling: true,
                  supports_public_archive: true,
                  plan_tier: 'creator_or_higher',
                  availability_status: 'not_configured',
                  availability_reason: 'Credentials are not configured yet.',
                  metadata: null,
                  created_at: '2026-03-31T10:00:00.000Z',
                  updated_at: '2026-03-31T10:00:00.000Z',
                },
              ],
              error: null,
            });
          },
        };
      },
    } as any;

    const rows = await createContentDestinationAdminData(supabase).getDestinations();

    expect(rows).toEqual([
      {
        id: 'dest-1',
        destination_key: 'kit_newsletter',
        destination_type: 'newsletter',
        provider_name: 'kit',
        display_name: 'Kit',
        enabled: false,
        is_default: false,
        requires_paid_plan: true,
        supports_api_publish: true,
        supports_scheduling: true,
        supports_public_archive: true,
        plan_tier: 'creator_or_higher',
        availability_status: 'not_configured',
        availability_reason: 'Credentials are not configured yet.',
        metadata: {},
        created_at: '2026-03-31T10:00:00.000Z',
        updated_at: '2026-03-31T10:00:00.000Z',
      },
    ]);
  });
});
