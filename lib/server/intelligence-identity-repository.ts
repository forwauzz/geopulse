import 'server-only';

import type { createServiceRoleClient } from '@/lib/supabase/service-role';

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

export type CanonicalIdentityResolution =
  | {
      readonly status: 'mapped';
      readonly domainId: string;
      readonly pageId: string | null;
      readonly normalizedHost: string;
      readonly normalizedUrl: string | null;
    }
  | {
      readonly status: 'unmapped' | 'needs_review';
      readonly reason: string;
    };

export function createIntelligenceIdentityRepository(supabase: ServiceRoleClient) {
  return {
    async resolveSource(sourceKind: string, sourceId: string): Promise<CanonicalIdentityResolution> {
      const { data, error } = await supabase
        .from('intelligence_source_identity_maps')
        .select('mapping_status,unmapped_reason,canonical_domain_id,canonical_page_id,intelligence_domains(normalized_host),intelligence_pages(normalized_url)')
        .eq('source_kind', sourceKind)
        .eq('source_id', sourceId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { status: 'unmapped', reason: 'source_mapping_missing' };
      if (data.mapping_status !== 'mapped' || !data.canonical_domain_id) {
        return {
          status: data.mapping_status === 'needs_review' ? 'needs_review' : 'unmapped',
          reason: data.unmapped_reason ?? 'identity_unmapped',
        };
      }
      const domain = data.intelligence_domains as unknown as { normalized_host?: string } | null;
      const page = data.intelligence_pages as unknown as { normalized_url?: string } | null;
      return {
        status: 'mapped',
        domainId: String(data.canonical_domain_id),
        pageId: data.canonical_page_id ? String(data.canonical_page_id) : null,
        normalizedHost: String(domain?.normalized_host ?? ''),
        normalizedUrl: page?.normalized_url ? String(page.normalized_url) : null,
      };
    },

    async resolveHost(normalizedHost: string): Promise<CanonicalIdentityResolution> {
      const { data, error } = await supabase
        .from('intelligence_domain_aliases')
        .select('domain_id,review_state,intelligence_domains(normalized_host)')
        .eq('alias_host', normalizedHost);
      if (error) throw error;
      if (!data || data.length === 0) return { status: 'unmapped', reason: 'host_alias_missing' };
      const verified = data.filter((row) => row.review_state === 'verified');
      const domainIds = new Set(verified.map((row) => String(row.domain_id)));
      if (domainIds.size !== 1) return { status: 'needs_review', reason: 'host_alias_ambiguous' };
      const row = verified[0]!;
      const domain = row.intelligence_domains as unknown as { normalized_host?: string } | null;
      return {
        status: 'mapped',
        domainId: String(row.domain_id),
        pageId: null,
        normalizedHost: String(domain?.normalized_host ?? normalizedHost),
        normalizedUrl: null,
      };
    },

    async recordDomainRelationship(input: {
      domainId: string;
      aliasHost: string;
      relationship: 'redirect' | 'rebrand';
      observedFrom: string;
      metadata?: Record<string, unknown>;
    }): Promise<void> {
      const { error } = await supabase.from('intelligence_domain_aliases').upsert({
        domain_id: input.domainId,
        alias_host: input.aliasHost,
        relationship: input.relationship,
        review_state: 'needs_review',
        observed_from: input.observedFrom,
        normalization_version: 'domain-page-v1',
        metadata: input.metadata ?? {},
      }, {
        onConflict: 'domain_id,alias_host',
      });
      if (error) throw error;
    },
  };
}
