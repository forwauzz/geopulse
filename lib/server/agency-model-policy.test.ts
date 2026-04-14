import { describe, expect, it } from 'vitest';
import { resolveAgencyModelPolicy } from './agency-model-policy';

describe('agency model policy', () => {
  it('uses client override when a supported provider is configured', async () => {
    const supabase = {
      from(table: string) {
        expect(table).toBe('agency_model_policies');
        let filters: Record<string, unknown> = {};
        return {
          select() {
            return this;
          },
          eq(field: string, value: unknown) {
            filters[field] = value;
            return this;
          },
          is(field: string, value: unknown) {
            filters[field] = value;
            return this;
          },
          maybeSingle() {
            if (filters['agency_client_id'] === 'client-1') {
              return Promise.resolve({
                data: { provider_name: 'gemini', model_id: 'gemini-2.5-pro' },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    } as any;

    await expect(
      resolveAgencyModelPolicy({
        supabase,
        agencyAccountId: 'acct-1',
        agencyClientId: 'client-1',
        productSurface: 'deep_audit',
        fallbackProvider: 'gemini',
        fallbackModelId: 'gemini-2.0-flash',
      })
    ).resolves.toEqual({
      requestedModelPolicy: 'gemini/gemini-2.5-pro',
      requestedProvider: 'gemini',
      requestedModel: 'gemini-2.5-pro',
      effectiveProvider: 'gemini',
      effectiveModel: 'gemini-2.5-pro',
      source: 'client',
      fallbackReason: null,
    });
  });

  it('falls back to the runtime default when an unsupported provider is configured', async () => {
    const supabase = {
      from(table: string) {
        expect(table).toBe('agency_model_policies');
        let filters: Record<string, unknown> = {};
        return {
          select() {
            return this;
          },
          eq(field: string, value: unknown) {
            filters[field] = value;
            return this;
          },
          is(field: string, value: unknown) {
            filters[field] = value;
            return this;
          },
          maybeSingle() {
            if (filters['agency_client_id'] === null) {
              return Promise.resolve({
                data: { provider_name: 'openai', model_id: 'gpt-5.5' },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    } as any;

    await expect(
      resolveAgencyModelPolicy({
        supabase,
        agencyAccountId: 'acct-1',
        agencyClientId: null,
        productSurface: 'deep_audit',
        fallbackProvider: 'gemini',
        fallbackModelId: 'gemini-2.0-flash',
      })
    ).resolves.toEqual({
      requestedModelPolicy: 'openai/gpt-5.5',
      requestedProvider: 'openai',
      requestedModel: 'gpt-5.5',
      effectiveProvider: 'gemini',
      effectiveModel: 'gemini-2.0-flash',
      source: 'account',
      fallbackReason: 'unsupported_provider',
    });
  });
});
