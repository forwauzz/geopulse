type SupabaseLike = {
  from(table: string): any;
};

export type AdminLogFilters = {
  readonly event?: string | null;
  readonly level?: string | null;
  readonly query?: string | null;
  readonly limit?: number | null;
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
      const normalizedLimit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
      let query = supabase
        .from('app_logs')
        .select('id,level,event,data,created_at')
        .order('created_at', { ascending: false })
        .limit(normalizedLimit);

      if (filters.event) query = query.eq('event', filters.event);
      if (filters.level) query = query.eq('level', filters.level);

      const { data, error } = await query;
      if (error) throw error;

      const rows = ((data ?? []) as AppLogRow[]).map((row) => ({
        ...row,
        data: row.data ?? {},
      }));

      const search = filters.query?.trim().toLowerCase();
      if (!search) {
        return rows;
      }

      return rows.filter((row) => {
        const payload = JSON.stringify(row.data ?? {}).toLowerCase();
        return row.event.toLowerCase().includes(search) || payload.includes(search);
      });
    },
  };
}
