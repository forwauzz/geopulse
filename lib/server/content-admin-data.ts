type SupabaseLike = {
  from(table: string): any;
};

export type ContentAdminFilters = {
  readonly status?: string | null;
  readonly contentType?: string | null;
  readonly targetPersona?: string | null;
};

export type ContentAdminListRow = {
  readonly id: string;
  readonly content_id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: string;
  readonly content_type: string;
  readonly target_persona: string | null;
  readonly primary_problem: string | null;
  readonly topic_cluster: string | null;
  readonly cta_goal: string;
  readonly canonical_url: string | null;
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly delivery_count: number;
  readonly published_delivery_count: number;
  readonly latest_delivery_destination: string | null;
  readonly latest_delivery_status: string | null;
};

export type ContentAdminDetailRow = {
  readonly id: string;
  readonly content_id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: string;
  readonly content_type: string;
  readonly target_persona: string | null;
  readonly primary_problem: string | null;
  readonly topic_cluster: string | null;
  readonly keyword_cluster: string | null;
  readonly cta_goal: string;
  readonly source_type: string;
  readonly source_links: string[];
  readonly brief_markdown: string | null;
  readonly draft_markdown: string | null;
  readonly canonical_url: string | null;
  readonly metadata: Record<string, unknown>;
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deliveries: DeliveryRow[];
};

type ContentItemRow = Omit<
  ContentAdminListRow,
  'delivery_count' | 'published_delivery_count' | 'latest_delivery_destination' | 'latest_delivery_status'
>;

type DeliveryRow = {
  readonly id: string;
  readonly content_item_id: string;
  readonly destination_type: string;
  readonly destination_name: string;
  readonly status: string;
  readonly published_at: string | null;
  readonly created_at: string;
};

export function createContentAdminData(supabase: SupabaseLike) {
  return {
    async getRecentContentItems(filters: ContentAdminFilters = {}): Promise<ContentAdminListRow[]> {
      let query = supabase
        .from('content_items')
        .select(
          'id,content_id,slug,title,status,content_type,target_persona,primary_problem,topic_cluster,cta_goal,canonical_url,published_at,created_at,updated_at'
        )
        .order('updated_at', { ascending: false })
        .limit(100);

      if (filters.status) query = query.eq('status', filters.status);
      if (filters.contentType) query = query.eq('content_type', filters.contentType);
      if (filters.targetPersona) query = query.eq('target_persona', filters.targetPersona);

      const { data, error } = await query;
      if (error) throw error;

      const items = (data ?? []) as ContentItemRow[];
      if (items.length === 0) return [];

      const { data: deliveries, error: deliveryError } = await supabase
        .from('content_distribution_deliveries')
        .select('id,content_item_id,destination_type,destination_name,status,published_at,created_at')
        .in(
          'content_item_id',
          items.map((item) => item.id)
        )
        .order('created_at', { ascending: false });

      if (deliveryError) throw deliveryError;

      const deliveriesByContentItem = new Map<string, DeliveryRow[]>();
      for (const delivery of (deliveries ?? []) as DeliveryRow[]) {
        const existing = deliveriesByContentItem.get(delivery.content_item_id) ?? [];
        existing.push(delivery);
        deliveriesByContentItem.set(delivery.content_item_id, existing);
      }

      return items.map((item) => {
        const itemDeliveries = deliveriesByContentItem.get(item.id) ?? [];
        const latestDelivery = itemDeliveries[0] ?? null;

        return {
          ...item,
          delivery_count: itemDeliveries.length,
          published_delivery_count: itemDeliveries.filter((delivery) => delivery.status === 'published')
            .length,
          latest_delivery_destination: latestDelivery?.destination_name ?? null,
          latest_delivery_status: latestDelivery?.status ?? null,
        };
      });
    },

    async getContentItemDetail(contentId: string): Promise<ContentAdminDetailRow | null> {
      const { data, error } = await supabase
        .from('content_items')
        .select(
          'id,content_id,slug,title,status,content_type,target_persona,primary_problem,topic_cluster,keyword_cluster,cta_goal,source_type,source_links,brief_markdown,draft_markdown,canonical_url,metadata,published_at,created_at,updated_at'
        )
        .eq('content_id', contentId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const item = data as Omit<ContentAdminDetailRow, 'deliveries'>;

      const { data: deliveries, error: deliveryError } = await supabase
        .from('content_distribution_deliveries')
        .select('id,content_item_id,destination_type,destination_name,status,published_at,created_at')
        .eq('content_item_id', item.id)
        .order('created_at', { ascending: false });

      if (deliveryError) throw deliveryError;

      return {
        ...item,
        source_links: Array.isArray(item.source_links) ? item.source_links : [],
        metadata: item.metadata ?? {},
        deliveries: (deliveries ?? []) as DeliveryRow[],
      };
    },
  };
}
