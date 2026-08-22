import { createServiceRoleClient } from '@/lib/supabase/service-role';
import type { BuyerIntelligenceSharePayload } from './buyer-intelligence-share-capability';
import { createSupabaseBuyerIntelligenceGenerationRepository } from './buyer-intelligence-generation-repository';

export async function loadBuyerIntelligenceShareTarget(args: {
  supabaseUrl: string; serviceRoleKey: string; payload: BuyerIntelligenceSharePayload;
}) {
  const db = createServiceRoleClient(args.supabaseUrl, args.serviceRoleKey);
  const [generation, contactResult, clientResult] = await Promise.all([
    createSupabaseBuyerIntelligenceGenerationRepository(db).load(
      args.payload.generationId, args.payload.agencyAccountId, args.payload.agencyClientId,
    ),
    db.from('crm_prospect_batch_contacts').select('provider_contact_id,email,canonical_domain,company_name,first_name')
      .eq('agency_account_id', args.payload.agencyAccountId)
      .eq('provider_contact_id', args.payload.providerContactId).maybeSingle(),
    db.from('agency_clients').select('id,agency_account_id,canonical_domain,metadata,status')
      .eq('id', args.payload.agencyClientId).eq('agency_account_id', args.payload.agencyAccountId).maybeSingle(),
  ]);
  const contact = contactResult.data; const client = clientResult.data;
  if (!generation || generation.status !== 'succeeded' || !generation.artifactR2Key || !contact || !client
    || client.status !== 'active' || contact.canonical_domain !== args.payload.domain
    || client.canonical_domain !== args.payload.domain) return null;
  return { db, generation, contact, client };
}
