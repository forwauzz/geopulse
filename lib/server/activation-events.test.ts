import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { deterministicActivationEventId } from './activation-events';
import { validateEvent } from '@services/marketing-attribution/ingest';

describe('activation events', () => {
  it('creates a stable UUID so retries cannot duplicate activation', async () => {
    const key = 'agency_client_activation_started:client-1:example.ca:ocv1';
    const first = await deterministicActivationEventId(key);
    expect(await deterministicActivationEventId(key)).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('accepts distinct direct-business and agency activation events', () => {
    for (const eventName of ['business_activation_started', 'agency_client_activation_started'] as const) {
      expect(validateEvent({
        event_id: crypto.randomUUID(),
        event_name: eventName,
        user_id: crypto.randomUUID(),
        metadata_json: {},
      })).toMatchObject({ ok: true, data: { event_name: eventName } });
    }
  });
});
