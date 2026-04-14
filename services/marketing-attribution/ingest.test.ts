import { describe, expect, it, vi } from 'vitest';
import { ingestEvent, validateEvent } from './ingest';

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: crypto.randomUUID(),
    event_name: 'scan_started',
    scan_id: 'b1b2c3d4-e5f6-7890-abcd-ef1234567890',
    utm_source: 'newsletter',
    ...overrides,
  };
}

describe('validateEvent', () => {
  it('returns ok for valid payload', () => {
    const result = validateEvent(validPayload());
    expect(result.ok).toBe(true);
  });

  it('returns error for missing event_name', () => {
    const { event_name: _, ...rest } = validPayload();
    const result = validateEvent(rest);
    expect(result.ok).toBe(false);
  });

  it('returns error for invalid event_name', () => {
    const result = validateEvent(validPayload({ event_name: 'bogus' }));
    expect(result.ok).toBe(false);
  });

  it('returns error for extra unknown fields', () => {
    const result = validateEvent(validPayload({ rogue_field: true }));
    expect(result.ok).toBe(false);
  });
});

function mockSupabase(insertResult: { error: null | { code?: string; message: string } }) {
  const insertFn = vi.fn().mockResolvedValue({ data: null, error: insertResult.error });
  const fromFn = vi.fn().mockReturnValue({ insert: insertFn });
  const schemaFn = vi.fn().mockReturnValue({ from: fromFn });
  return {
    client: { schema: schemaFn } as never,
    schemaFn,
    fromFn,
    insertFn,
  };
}

describe('ingestEvent', () => {
  it('returns 201 on successful insert', async () => {
    const { client } = mockSupabase({ error: null });
    const result = await ingestEvent(client, validPayload());
    expect(result).toEqual(
      expect.objectContaining({ ok: true, status: 201 })
    );
  });

  it('returns 200 on duplicate event_id (unique violation)', async () => {
    const { client } = mockSupabase({ error: { code: '23505', message: 'duplicate' } });
    const result = await ingestEvent(client, validPayload());
    expect(result).toEqual(
      expect.objectContaining({ ok: true, status: 200, duplicate: true })
    );
  });

  it('returns 500 on non-duplicate DB error', async () => {
    const { client } = mockSupabase({ error: { message: 'connection failed' } });
    const result = await ingestEvent(client, validPayload());
    expect(result).toEqual(
      expect.objectContaining({ ok: false, status: 500, reason: 'connection failed' })
    );
  });

  it('returns 400 on validation failure', async () => {
    const { client } = mockSupabase({ error: null });
    const result = await ingestEvent(client, { bad: 'data' });
    expect(result).toEqual(
      expect.objectContaining({ ok: false, status: 400 })
    );
  });

  it('calls supabase with analytics schema', async () => {
    const { client, schemaFn, fromFn } = mockSupabase({ error: null });
    await ingestEvent(client, validPayload());
    expect(schemaFn).toHaveBeenCalledWith('analytics');
    expect(fromFn).toHaveBeenCalledWith('marketing_events');
  });

  it('defaults event_ts to now when omitted', async () => {
    const { client, insertFn } = mockSupabase({ error: null });
    await ingestEvent(client, validPayload());
    const inserted = insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof inserted?.['event_ts']).toBe('string');
    expect(new Date(inserted['event_ts'] as string).getTime()).toBeGreaterThan(0);
  });
});
