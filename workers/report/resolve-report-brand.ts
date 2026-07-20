/**
 * Resolve which brand a generated report should carry, and load its logo bytes.
 *
 * Precedence: per-client override → agency account → startup workspace → GEO-Pulse. An agency's
 * own brand is the normal white-label case; a client-level brand exists so an agency can hand one
 * client a report under that client's own masthead without rebranding the whole account.
 *
 * Everything here is fail-soft: a missing row, a bad query, or a logo that fails validation must
 * degrade to the default brand (or a logo-less brand), never fail the paid report render.
 */
import type { BrandConfig } from './report-branding';
import { GEO_PULSE_BRAND, parseBrandConfig } from './report-branding';
import { detectImageType, MAX_LOGO_BYTES } from '../scan-engine/parse-brand-signals';

type SupabaseLike = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): {
        maybeSingle(): Promise<{ data: { metadata: unknown } | null; error: unknown }>;
      };
    };
  };
};

type R2BucketLike = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
};

export type ReportBrandScanRef = {
  readonly agency_client_id: string | null;
  readonly agency_account_id: string | null;
  readonly startup_workspace_id: string | null;
};

export type ReportBrandResolution = {
  readonly brand: BrandConfig;
  readonly logoBytes: Uint8Array | null;
};

function hasBrand(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const brand = (metadata as Record<string, unknown>)['brand'];
  return !!brand && typeof brand === 'object';
}

async function metadataFor(
  supabase: SupabaseLike,
  table: string,
  id: string
): Promise<unknown | null> {
  try {
    const { data, error } = await supabase.from(table).select('metadata').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return data.metadata;
  } catch {
    return null;
  }
}

export async function resolveReportBrand(args: {
  readonly supabase: SupabaseLike;
  readonly scan: ReportBrandScanRef;
  readonly bucket: R2BucketLike | null | undefined;
}): Promise<ReportBrandResolution> {
  const sources: Array<{ table: string; id: string | null }> = [
    { table: 'agency_clients', id: args.scan.agency_client_id },
    { table: 'agency_accounts', id: args.scan.agency_account_id },
    { table: 'startup_workspaces', id: args.scan.startup_workspace_id },
  ];

  let brand: BrandConfig = GEO_PULSE_BRAND;
  for (const source of sources) {
    if (!source.id) continue;
    const metadata = await metadataFor(args.supabase, source.table, source.id);
    if (!hasBrand(metadata)) continue;
    brand = parseBrandConfig(metadata);
    break;
  }

  if (!brand.logo || !args.bucket) {
    return { brand, logoBytes: null };
  }

  // The logo was validated at upload, but R2 content can change out of band — re-check the magic
  // bytes and size so a swapped object degrades to a text masthead instead of a failed embed.
  try {
    const object = await args.bucket.get(brand.logo.key);
    if (!object) return { brand, logoBytes: null };
    const buf = await object.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_LOGO_BYTES) return { brand, logoBytes: null };
    const bytes = new Uint8Array(buf);
    if (detectImageType(bytes) !== brand.logo.mime) return { brand, logoBytes: null };
    return { brand, logoBytes: bytes };
  } catch {
    return { brand, logoBytes: null };
  }
}
