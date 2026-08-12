import { z } from 'zod';
import { connectorAccountSchema, type ConnectorAccount, type ContactProjection } from '@/lib/connectors/crm-contract';
import { BREVO_SCOPE, refreshBrevoToken, type BrevoToken } from '@/lib/connectors/providers/brevo';
import {
  decryptDistributionToken,
  encryptDistributionToken,
  isEncryptedDistributionToken,
} from './distribution-token-crypto';

type Supabase = { from(table: string): any; rpc?(name: string, args: Record<string, unknown>): any };

type AccountRow = {
  readonly id: string;
  readonly agency_account_id: string;
  readonly external_account_id: string;
  readonly credential_ref: string;
  readonly scopes: string[];
  readonly status: ConnectorAccount['status'];
  readonly connected_at: string;
  readonly disconnected_at: string | null;
};

type CredentialRow = {
  readonly id: string;
  readonly access_token_encrypted: string | null;
  readonly refresh_token_encrypted: string | null;
  readonly expires_at: string | null;
  readonly updated_at: string;
};

type BatchContactRow = {
  readonly batch_id: string;
  readonly provider_contact_id: string;
  readonly first_name: string | null;
  readonly company_name: string;
  readonly canonical_domain: string;
  readonly email: string;
};

function isoTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw new Error('brevo_invalid_database_timestamp');
  return timestamp.toISOString();
}

export type BrevoConnection = {
  readonly account: ConnectorAccount;
  readonly lastErrorCode: string | null;
};

export type HeldBatch = {
  readonly id: string;
  readonly status: 'held' | 'cancelled';
  readonly createdAt: string;
  readonly contacts: readonly {
    readonly providerContactId: string;
    readonly firstName: string | null;
    readonly companyName: string;
    readonly canonicalDomain: string;
    readonly email: string;
  }[];
};

function fromAccountRow(row: AccountRow, expiresAt: string | null): ConnectorAccount {
  return connectorAccountSchema.parse({
    contractVersion: 'crm-connector-account-v1', accountId: row.id,
    tenant: { type: 'agency_account', id: row.agency_account_id }, provider: 'brevo',
    externalAccountId: row.external_account_id, credentialRef: row.credential_ref,
    scopes: row.scopes, status: row.status, connectedAt: isoTimestamp(row.connected_at),
    expiresAt: expiresAt ? isoTimestamp(expiresAt) : null,
    disconnectedAt: row.disconnected_at ? isoTimestamp(row.disconnected_at) : null,
  });
}

async function readCredential(supabase: Supabase, id: string): Promise<CredentialRow | null> {
  const { data, error } = await supabase.from('crm_connector_credentials').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as CredentialRow | null;
}

export function createBrevoConnectorRepository(supabase: Supabase) {
  async function accountRow(agencyAccountId: string): Promise<(AccountRow & { last_error_code: string | null }) | null> {
    const { data, error } = await supabase.from('crm_connector_accounts').select('*')
      .eq('agency_account_id', agencyAccountId).eq('provider', 'brevo').maybeSingle();
    if (error) throw error;
    return data as (AccountRow & { last_error_code: string | null }) | null;
  }

  return {
    async saveOAuthState(args: {
      readonly stateHash: string; readonly agencyAccountId: string;
      readonly userId: string; readonly expiresAt: string;
    }): Promise<void> {
      const { error } = await supabase.from('crm_connector_oauth_states').insert({
        state_hash: args.stateHash, provider: 'brevo', agency_account_id: args.agencyAccountId,
        user_id: args.userId, expires_at: args.expiresAt,
      });
      if (error) throw error;
    },

    async consumeOAuthState(args: {
      readonly stateHash: string; readonly agencyAccountId: string;
      readonly userId: string; readonly now?: string;
    }): Promise<boolean> {
      const now = args.now ?? new Date().toISOString();
      const { data, error } = await supabase.from('crm_connector_oauth_states')
        .update({ consumed_at: now }).eq('state_hash', args.stateHash).eq('provider', 'brevo')
        .eq('agency_account_id', args.agencyAccountId).eq('user_id', args.userId)
        .is('consumed_at', null).gt('expires_at', now).select('state_hash').maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },

    async load(agencyAccountId: string): Promise<BrevoConnection | null> {
      z.string().uuid().parse(agencyAccountId);
      const row = await accountRow(agencyAccountId);
      if (!row) return null;
      const credential = await readCredential(supabase, row.credential_ref);
      return {
        account: fromAccountRow(row, credential?.expires_at ?? null),
        lastErrorCode: row.last_error_code,
      };
    },

    async connect(args: {
      readonly agencyAccountId: string; readonly userId: string;
      readonly token: BrevoToken; readonly encryptionKey: string; readonly now?: Date;
    }): Promise<BrevoConnection> {
      const now = args.now ?? new Date();
      const access = await encryptDistributionToken(args.token.accessToken, args.encryptionKey);
      const refresh = args.token.refreshToken
        ? await encryptDistributionToken(args.token.refreshToken, args.encryptionKey) : null;
      const expiresAt = new Date(now.getTime() + args.token.expiresIn * 1000).toISOString();
      const existing = await accountRow(args.agencyAccountId);
      let credentialId = existing?.credential_ref ?? null;
      let createdCredential = false;
      if (credentialId) {
        const { error } = await supabase.from('crm_connector_credentials').update({
          access_token_encrypted: access, refresh_token_encrypted: refresh,
          expires_at: expiresAt, updated_at: now.toISOString(),
        }).eq('id', credentialId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('crm_connector_credentials').insert({
          provider: 'brevo', access_token_encrypted: access,
          refresh_token_encrypted: refresh, expires_at: expiresAt,
        }).select('id').single();
        if (error || !data) throw error ?? new Error('brevo_credential_insert_failed');
        credentialId = String(data.id);
        createdCredential = true;
      }
      const values = {
        agency_account_id: args.agencyAccountId, provider: 'brevo',
        external_account_id: args.token.subject, credential_ref: credentialId,
        scopes: [...args.token.scopes], status: 'connected', connected_by_user_id: args.userId,
        connected_at: now.toISOString(), disconnected_at: null, last_error_code: null,
        updated_at: now.toISOString(),
      };
      const { error } = await supabase.from('crm_connector_accounts').upsert(values, {
        onConflict: 'agency_account_id,provider',
      });
      if (error) {
        if (createdCredential) await supabase.from('crm_connector_credentials').delete().eq('id', credentialId);
        throw error;
      }
      const saved = await accountRow(args.agencyAccountId);
      if (!saved) throw new Error('brevo_connection_read_after_write_failed');
      return { account: fromAccountRow(saved, expiresAt), lastErrorCode: saved.last_error_code };
    },

    async accessToken(args: {
      readonly agencyAccountId: string; readonly clientId: string; readonly clientSecret: string;
      readonly encryptionKey: string; readonly now?: Date; readonly fetcher?: typeof fetch;
    }): Promise<{ readonly account: ConnectorAccount; readonly accessToken: string }> {
      const now = args.now ?? new Date();
      const row = await accountRow(args.agencyAccountId);
      if (!row || row.status !== 'connected') throw new Error('brevo_not_connected');
      const credential = await readCredential(supabase, row.credential_ref);
      if (!credential?.access_token_encrypted || !isEncryptedDistributionToken(credential.access_token_encrypted)) {
        throw new Error('brevo_access_token_unavailable');
      }
      const expiresAtMs = credential.expires_at ? Date.parse(credential.expires_at) : 0;
      if (expiresAtMs > now.getTime() + 120_000) {
        return {
          account: fromAccountRow(row, credential.expires_at),
          accessToken: await decryptDistributionToken(credential.access_token_encrypted, args.encryptionKey),
        };
      }
      if (!credential.refresh_token_encrypted || !isEncryptedDistributionToken(credential.refresh_token_encrypted)) {
        await supabase.from('crm_connector_accounts').update({
          status: 'expired', last_error_code: 'refresh_token_missing', updated_at: now.toISOString(),
        }).eq('id', row.id);
        throw new Error('brevo_refresh_token_unavailable');
      }
      try {
        const refreshToken = await decryptDistributionToken(credential.refresh_token_encrypted, args.encryptionKey);
        const token = await refreshBrevoToken({
          clientId: args.clientId, clientSecret: args.clientSecret, refreshToken, fetcher: args.fetcher,
        });
        const nextExpiry = new Date(now.getTime() + token.expiresIn * 1000).toISOString();
        const nextAccess = await encryptDistributionToken(token.accessToken, args.encryptionKey);
        const nextRefresh = token.refreshToken
          ? await encryptDistributionToken(token.refreshToken, args.encryptionKey)
          : credential.refresh_token_encrypted;
        const { error } = await supabase.from('crm_connector_credentials').update({
          access_token_encrypted: nextAccess, refresh_token_encrypted: nextRefresh,
          expires_at: nextExpiry, updated_at: now.toISOString(),
        }).eq('id', credential.id);
        if (error) throw error;
        await supabase.from('crm_connector_accounts').update({
          external_account_id: token.subject, scopes: [...token.scopes], last_error_code: null,
          updated_at: now.toISOString(),
        }).eq('id', row.id);
        return { account: fromAccountRow({ ...row, external_account_id: token.subject, scopes: [...token.scopes] }, nextExpiry), accessToken: token.accessToken };
      } catch (error) {
        await supabase.from('crm_connector_accounts').update({
          status: 'expired', last_error_code: error instanceof Error ? error.message.slice(0, 120) : 'refresh_failed',
          updated_at: now.toISOString(),
        }).eq('id', row.id);
        throw error;
      }
    },

    async disconnect(agencyAccountId: string, now = new Date()): Promise<void> {
      const row = await accountRow(agencyAccountId);
      if (!row) return;
      const timestamp = now.toISOString();
      const { error } = await supabase.from('crm_connector_accounts').update({
        status: 'disconnected', disconnected_at: timestamp, last_error_code: null, updated_at: timestamp,
      }).eq('id', row.id).eq('agency_account_id', agencyAccountId);
      if (error) throw error;
      const { error: credentialError } = await supabase.from('crm_connector_credentials').update({
        access_token_encrypted: null, refresh_token_encrypted: null, expires_at: null, updated_at: timestamp,
      }).eq('id', row.credential_ref);
      if (credentialError) throw credentialError;
    },

    async createHeldBatch(args: {
      readonly agencyAccountId: string; readonly connectorAccountId: string;
      readonly userId: string; readonly contacts: readonly ContactProjection[];
    }): Promise<string> {
      if (!supabase.rpc) throw new Error('brevo_held_batch_rpc_unavailable');
      const contacts = args.contacts.map((contact) => ({
        provider_contact_id: contact.providerContactId, first_name: contact.firstName,
        company_name: contact.companyName, canonical_domain: contact.canonicalDomain,
        email: contact.email, source_list_ids: contact.listIds,
        suppression_state: contact.suppressionState, source_version: contact.sourceVersion,
        observed_at: contact.observedAt,
      }));
      const { data, error } = await supabase.rpc('create_crm_held_batch', {
        p_agency_account_id: args.agencyAccountId,
        p_connector_account_id: args.connectorAccountId,
        p_created_by_user_id: args.userId,
        p_contacts: contacts,
      });
      if (error || !data) throw error ?? new Error('brevo_held_batch_create_failed');
      return z.string().uuid().parse(data);
    },

    async listHeldBatches(agencyAccountId: string, limit = 10): Promise<HeldBatch[]> {
      const { data: batches, error } = await supabase.from('crm_prospect_batches').select('id,status,created_at')
        .eq('agency_account_id', agencyAccountId).order('created_at', { ascending: false }).limit(Math.min(20, Math.max(1, limit)));
      if (error) throw error;
      const ids = (batches ?? []).map((batch: { id: string }) => batch.id);
      if (ids.length === 0) return [];
      const { data: contacts, error: contactError } = await supabase.from('crm_prospect_batch_contacts')
        .select('batch_id,provider_contact_id,first_name,company_name,canonical_domain,email')
        .eq('agency_account_id', agencyAccountId).in('batch_id', ids);
      if (contactError) throw contactError;
      const contactRows = (contacts ?? []) as BatchContactRow[];
      return (batches ?? []).map((batch: { id: string; status: 'held' | 'cancelled'; created_at: string }) => ({
        id: batch.id, status: batch.status, createdAt: batch.created_at,
        contacts: contactRows.filter((contact) => contact.batch_id === batch.id)
          .map((contact) => ({
            providerContactId: String(contact.provider_contact_id), firstName: contact.first_name,
            companyName: String(contact.company_name), canonicalDomain: String(contact.canonical_domain),
            email: String(contact.email),
          })),
      }));
    },
  };
}
