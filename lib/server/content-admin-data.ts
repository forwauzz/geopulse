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

export type ContentPublishCheckTrendRow = {
  readonly content_id: string;
  readonly title: string;
  readonly status: string;
  readonly updated_at: string;
  readonly metadata: Record<string, unknown>;
};

export type ContentDraftQueueRow = {
  readonly content_id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: 'brief' | 'draft' | 'review';
  readonly topic_cluster: string | null;
  readonly queue_owner: string | null;
  readonly queue_target_week: string | null;
  readonly updated_at: string;
};

export type ContentDraftQueueFilters = {
  readonly owner?: string | null;
  readonly targetWeek?: string | null;
};

export type ContentApprovedQueueRow = {
  readonly content_id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: 'approved';
  readonly topic_cluster: string | null;
  readonly queue_owner: string | null;
  readonly queue_target_week: string | null;
  readonly updated_at: string;
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

type PublishCheckTrendRawRow = {
  readonly content_id: unknown;
  readonly title: unknown;
  readonly status: unknown;
  readonly updated_at: unknown;
  readonly metadata: unknown;
};

function readRequiredText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readOptionalText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readMetadataText(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

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
          content_id: readRequiredText(item.content_id),
          slug: readRequiredText(item.slug),
          title: readRequiredText(item.title),
          status: readRequiredText(item.status),
          content_type: readRequiredText(item.content_type),
          cta_goal: readRequiredText(item.cta_goal),
          canonical_url: readOptionalText(item.canonical_url),
          created_at: readRequiredText(item.created_at),
          updated_at: readRequiredText(item.updated_at),
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
        content_id: readRequiredText(item.content_id),
        slug: readRequiredText(item.slug),
        title: readRequiredText(item.title),
        status: readRequiredText(item.status),
        content_type: readRequiredText(item.content_type),
        cta_goal: readRequiredText(item.cta_goal),
        source_type: readRequiredText(item.source_type),
        brief_markdown: readOptionalText(item.brief_markdown),
        draft_markdown: readOptionalText(item.draft_markdown),
        canonical_url: readOptionalText(item.canonical_url),
        created_at: readRequiredText(item.created_at),
        updated_at: readRequiredText(item.updated_at),
        source_links: Array.isArray(item.source_links) ? item.source_links : [],
        metadata: item.metadata ?? {},
        deliveries: (deliveries ?? []) as DeliveryRow[],
      };
    },

    async getRecentPublishCheckTrendRows(limit = 100): Promise<ContentPublishCheckTrendRow[]> {
      const { data, error } = await supabase
        .from('content_items')
        .select('content_id,title,status,updated_at,metadata')
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return ((data ?? []) as PublishCheckTrendRawRow[]).map((row) => ({
        content_id: readRequiredText(row.content_id),
        title: readRequiredText(row.title),
        status: readRequiredText(row.status),
        updated_at: readRequiredText(row.updated_at),
        metadata:
          typeof row.metadata === 'object' && row.metadata !== null
            ? (row.metadata as Record<string, unknown>)
            : {},
      }));
    },

    async getArticleDraftQueue(
      limitPerStatus = 10,
      filters: ContentDraftQueueFilters = {}
    ): Promise<{
      readonly brief: ContentDraftQueueRow[];
      readonly draft: ContentDraftQueueRow[];
      readonly review: ContentDraftQueueRow[];
    }> {
      const queueStatuses = ['brief', 'draft', 'review'] as const;

      const { data, error } = await supabase
        .from('content_items')
        .select('content_id,slug,title,status,topic_cluster,metadata,updated_at')
        .eq('content_type', 'article')
        .in('status', [...queueStatuses])
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const rows = ((data ?? []) as Array<{
        content_id?: unknown;
        slug?: unknown;
        title?: unknown;
        status?: unknown;
        topic_cluster?: unknown;
        metadata?: unknown;
        updated_at?: unknown;
      }>).map((row) => ({
        content_id: readRequiredText(row.content_id),
        slug: readRequiredText(row.slug),
        title: readRequiredText(row.title),
        status: readRequiredText(row.status) as ContentDraftQueueRow['status'],
        topic_cluster: readOptionalText(row.topic_cluster),
        queue_owner: readMetadataText(row.metadata, 'queue_owner'),
        queue_target_week: readMetadataText(row.metadata, 'queue_target_week'),
        updated_at: readRequiredText(row.updated_at),
      }));

      const ownerFilter = filters.owner?.trim().toLowerCase() ?? '';
      const targetWeekFilter = filters.targetWeek?.trim() ?? '';
      const filteredRows = rows.filter((row) => {
        if (ownerFilter) {
          const owner = row.queue_owner?.toLowerCase() ?? '';
          if (!owner.includes(ownerFilter)) return false;
        }
        if (targetWeekFilter) {
          const targetWeek = row.queue_target_week ?? '';
          if (targetWeek !== targetWeekFilter) return false;
        }
        return true;
      });

      const byStatus = {
        brief: [] as ContentDraftQueueRow[],
        draft: [] as ContentDraftQueueRow[],
        review: [] as ContentDraftQueueRow[],
      };

      for (const status of queueStatuses) {
        byStatus[status] = filteredRows
          .filter((row) => row.status === status)
          .slice(0, limitPerStatus);
      }

      return byStatus;
    },

    async getApprovedArticleQueue(
      limit = 25,
      filters: ContentDraftQueueFilters = {}
    ): Promise<{
      readonly totalFilteredCount: number;
      readonly rows: ContentApprovedQueueRow[];
    }> {
      const { data, error } = await supabase
        .from('content_items')
        .select('content_id,slug,title,status,topic_cluster,metadata,updated_at')
        .eq('content_type', 'article')
        .eq('status', 'approved')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const rows = ((data ?? []) as Array<{
        content_id?: unknown;
        slug?: unknown;
        title?: unknown;
        status?: unknown;
        topic_cluster?: unknown;
        metadata?: unknown;
        updated_at?: unknown;
      }>)
        .map((row) => ({
          content_id: readRequiredText(row.content_id),
          slug: readRequiredText(row.slug),
          title: readRequiredText(row.title),
          status: readRequiredText(row.status) as 'approved',
          topic_cluster: readOptionalText(row.topic_cluster),
          queue_owner: readMetadataText(row.metadata, 'queue_owner'),
          queue_target_week: readMetadataText(row.metadata, 'queue_target_week'),
          updated_at: readRequiredText(row.updated_at),
        }))
        .filter((row) => row.content_id);

      const ownerFilter = filters.owner?.trim().toLowerCase() ?? '';
      const targetWeekFilter = filters.targetWeek?.trim() ?? '';
      const filteredRows = rows.filter((row) => {
        if (ownerFilter) {
          const owner = row.queue_owner?.toLowerCase() ?? '';
          if (!owner.includes(ownerFilter)) return false;
        }
        if (targetWeekFilter) {
          const targetWeek = row.queue_target_week ?? '';
          if (targetWeek !== targetWeekFilter) return false;
        }
        return true;
      });

      return {
        totalFilteredCount: filteredRows.length,
        rows: filteredRows.slice(0, Math.max(1, Math.min(limit, 100))),
      };
    },
  };
}
