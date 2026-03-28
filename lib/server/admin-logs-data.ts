type SupabaseLike = {
  from(table: string): any;
};

export type AdminLogFilters = {
  readonly event?: string | null;
  readonly level?: string | null;
};

export type AppLogRow = {
  readonly id: string;
  readonly level: 'info' | 'warning' | 'error';
  readonly event: string;
  readonly data: Record<string, unknown>;
  readonly created_at: string;
};

export function createAdminLogsData(supabase: SupabaseLike) {
  return {
    async getRecentLogs(filters: AdminLogFilters = {}): Promise<AppLogRow[]> {
      let query = supabase
        .from('app_logs')
        .select('id,level,event,data,created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (filters.event) query = query.eq('event', filters.event);
      if (filters.level) query = query.eq('level', filters.level);

      const { data, error } = await query;
      if (error) throw error;

      return ((data ?? []) as AppLogRow[]).map((row) => ({
        ...row,
        data: row.data ?? {},
      }));
    },
  };
}
