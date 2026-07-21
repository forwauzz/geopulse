/**
 * Server-side storage for per-customer report branding.
 *
 * Brand fields live under `metadata.brand` on the owning row (startup workspace, agency account,
 * or agency client) — the same shape `parseBrandConfig` reads at render time — and the logo binary
 * lives in the REPORT_FILES R2 bucket. Everything callers hand us is untrusted: colours are
 * re-validated, uploaded bytes are magic-byte-sniffed, and remote logo URLs only ever reach the
 * network through the SSRF fetch gate.
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { hexToRgb01 } from '@workers/report/report-branding';
import { detectImageType, MAX_LOGO_BYTES } from '@workers/scan-engine/parse-brand-signals';
import { fetchBrandLogo } from '@workers/report/fetch-brand-logo';
import { publicObjectUrl } from '@workers/report/r2-report-storage';

export type BrandScopeTable = 'startup_workspaces' | 'agency_accounts' | 'agency_clients';

export type BrandScope = {
  readonly table: BrandScopeTable;
  readonly id: string;
};

type SupabaseLike = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): { maybeSingle(): Promise<{ data: { metadata: unknown } | null; error: unknown }> };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: unknown }>;
    };
  };
};

type R2BucketLike = {
  put(
    key: string,
    value: Uint8Array | ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
};

export type BrandSettingsView = {
  readonly companyName: string;
  readonly primaryHex: string;
  readonly footerNote: string;
  readonly showPoweredBy: boolean;
  readonly logoKey: string | null;
  readonly logoMime: string | null;
  /** Public URL for previewing the stored logo, when a public base is configured. */
  readonly logoUrl: string | null;
};

export type BrandFieldsInput = {
  readonly companyName: string;
  readonly primaryHex: string;
  readonly footerNote: string;
  readonly showPoweredBy: boolean;
};

export type BrandMutationResult = { ok: true } | { ok: false; code: string };

/**
 * REPORT_FILES binding via the dual async/sync context lookup (the async Node path can omit
 * bindings — same workaround as `resolveScanQueue` in cf-env).
 */
export async function resolveReportFilesBucket(): Promise<R2Bucket | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as unknown as Record<string, unknown>)['REPORT_FILES'];
    if (bucket && typeof (bucket as R2Bucket).put === 'function') return bucket as R2Bucket;
  } catch {
    /* fall through */
  }
  try {
    const { env } = getCloudflareContext({ async: false });
    const bucket = (env as unknown as Record<string, unknown>)['REPORT_FILES'];
    if (bucket && typeof (bucket as R2Bucket).put === 'function') return bucket as R2Bucket;
  } catch {
    /* unavailable */
  }
  return undefined;
}

export async function resolveReportFilesPublicBase(): Promise<string | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const base = (env as unknown as Record<string, unknown>)['DEEP_AUDIT_R2_PUBLIC_BASE'];
    if (typeof base === 'string' && base.trim()) return base.trim();
  } catch {
    /* unavailable */
  }
  return null;
}

function brandRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object') return {};
  const brand = (metadata as Record<string, unknown>)['brand'];
  return brand && typeof brand === 'object' ? { ...(brand as Record<string, unknown>) } : {};
}

async function readMetadata(supabase: SupabaseLike, scope: BrandScope): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from(scope.table).select('metadata').eq('id', scope.id).maybeSingle();
  if (error) throw new Error('brand_metadata_read_failed');
  const metadata = data?.metadata;
  return metadata && typeof metadata === 'object' ? { ...(metadata as Record<string, unknown>) } : {};
}

async function writeBrand(
  supabase: SupabaseLike,
  scope: BrandScope,
  mutate: (brand: Record<string, unknown>) => Record<string, unknown>
): Promise<void> {
  const metadata = await readMetadata(supabase, scope);
  const next = mutate(brandRecord(metadata));
  const { error } = await supabase
    .from(scope.table)
    .update({ metadata: { ...metadata, brand: next } })
    .eq('id', scope.id);
  if (error) throw new Error('brand_metadata_write_failed');
}

export async function getBrandSettingsView(args: {
  readonly supabase: SupabaseLike;
  readonly scope: BrandScope;
  readonly publicBase: string | null;
}): Promise<BrandSettingsView> {
  const brand = brandRecord(await readMetadata(args.supabase, args.scope));
  const logoKey = typeof brand['logoKey'] === 'string' && brand['logoKey'] ? (brand['logoKey'] as string) : null;
  return {
    companyName: typeof brand['companyName'] === 'string' ? (brand['companyName'] as string) : '',
    primaryHex: typeof brand['primary'] === 'string' ? (brand['primary'] as string) : '',
    footerNote: typeof brand['footerNote'] === 'string' ? (brand['footerNote'] as string) : '',
    showPoweredBy: brand['showPoweredBy'] !== false,
    logoKey,
    logoMime: typeof brand['logoMime'] === 'string' ? (brand['logoMime'] as string) : null,
    logoUrl: logoKey && args.publicBase ? publicObjectUrl(args.publicBase, logoKey) : null,
  };
}

/** Save the text/colour fields, leaving any stored logo untouched. */
export async function saveBrandFields(args: {
  readonly supabase: SupabaseLike;
  readonly scope: BrandScope;
  readonly fields: BrandFieldsInput;
}): Promise<BrandMutationResult> {
  const companyName = args.fields.companyName.trim().slice(0, 80);
  const footerNote = args.fields.footerNote.trim().slice(0, 160);
  const primaryHex = args.fields.primaryHex.trim();

  if (primaryHex && !hexToRgb01(primaryHex)) {
    return { ok: false, code: 'brand_invalid_color' };
  }

  await writeBrand(args.supabase, args.scope, (brand) => ({
    ...brand,
    companyName: companyName || undefined,
    primary: primaryHex || undefined,
    footerNote: footerNote || undefined,
    showPoweredBy: args.fields.showPoweredBy,
  }));
  return { ok: true };
}

function logoObjectKey(scope: BrandScope, mime: 'image/png' | 'image/jpeg'): string {
  return `brand-logos/${scope.table}/${scope.id}/logo.${mime === 'image/png' ? 'png' : 'jpg'}`;
}

/** Validate uploaded bytes (size + magic bytes), store them in R2, and point `metadata.brand` at them. */
export async function storeBrandLogoBytes(args: {
  readonly supabase: SupabaseLike;
  readonly bucket: R2BucketLike;
  readonly scope: BrandScope;
  readonly bytes: Uint8Array;
}): Promise<BrandMutationResult> {
  if (args.bytes.length === 0) return { ok: false, code: 'brand_logo_invalid' };
  if (args.bytes.length > MAX_LOGO_BYTES) return { ok: false, code: 'brand_logo_too_large' };

  const mime = detectImageType(args.bytes);
  if (!mime) return { ok: false, code: 'brand_logo_invalid' };

  const key = logoObjectKey(args.scope, mime);
  await args.bucket.put(key, args.bytes, {
    httpMetadata: { contentType: mime, cacheControl: 'public, max-age=3600' },
  });

  await writeBrand(args.supabase, args.scope, (brand) => ({ ...brand, logoKey: key, logoMime: mime }));
  return { ok: true };
}

/**
 * Pull a logo from a URL found on (or entered for) the customer's site. The URL is
 * attacker-influencable, so the download happens exclusively through the SSRF fetch gate.
 */
export async function importBrandLogoFromUrl(args: {
  readonly supabase: SupabaseLike;
  readonly bucket: R2BucketLike;
  readonly scope: BrandScope;
  readonly url: string;
}): Promise<BrandMutationResult> {
  const fetched = await fetchBrandLogo(args.url);
  if (!fetched.ok) return { ok: false, code: 'brand_logo_fetch_failed' };
  return storeBrandLogoBytes({
    supabase: args.supabase,
    bucket: args.bucket,
    scope: args.scope,
    bytes: fetched.bytes,
  });
}

export async function removeBrandLogo(args: {
  readonly supabase: SupabaseLike;
  readonly bucket: R2BucketLike | null;
  readonly scope: BrandScope;
}): Promise<BrandMutationResult> {
  const brand = brandRecord(await readMetadata(args.supabase, args.scope));
  const key = typeof brand['logoKey'] === 'string' ? (brand['logoKey'] as string) : null;
  if (key && args.bucket) {
    try {
      await args.bucket.delete(key);
    } catch {
      // The metadata pointer is the source of truth; a stranded object is harmless.
    }
  }
  await writeBrand(args.supabase, args.scope, (current) => {
    const next = { ...current };
    delete next['logoKey'];
    delete next['logoMime'];
    return next;
  });
  return { ok: true };
}
