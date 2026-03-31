type SupabaseLike = {
  from(table: string): any;
};

export type ContentDestinationRow = {
  readonly id: string;
  readonly destination_key: string;
  readonly destination_type: string;
  readonly provider_name: string;
  readonly display_name: string;
  readonly enabled: boolean;
  readonly is_default: boolean;
  readonly requires_paid_plan: boolean;
  readonly supports_api_publish: boolean;
  readonly supports_scheduling: boolean;
  readonly supports_public_archive: boolean;
  readonly plan_tier: string | null;
  readonly availability_status: string;
  readonly availability_reason: string | null;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
};

export function createContentDestinationAdminData(supabase: SupabaseLike) {
  return {
    async getDestinations(): Promise<ContentDestinationRow[]> {
      const { data, error } = await supabase
        .from('content_distribution_destinations')
        .select(
          'id,destination_key,destination_type,provider_name,display_name,enabled,is_default,requires_paid_plan,supports_api_publish,supports_scheduling,supports_public_archive,plan_tier,availability_status,availability_reason,metadata,created_at,updated_at'
        )
        .order('destination_type', { ascending: true })
        .order('display_name', { ascending: true });

      if (error) throw error;

      return ((data ?? []) as ContentDestinationRow[]).map((row) => ({
        ...row,
        metadata: row.metadata ?? {},
      }));
    },
  };
}
