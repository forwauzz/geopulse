import {
  importStartupBrandLogo,
  removeStartupBrandLogo,
  saveStartupBrandSettings,
  uploadStartupBrandLogo,
} from '@/app/dashboard/startup/branding-actions';
import { getScanApiEnv } from '@/lib/server/cf-env';
import {
  getBrandSettingsView,
  resolveReportFilesPublicBase,
  type BrandSettingsView,
} from '@/lib/server/report-branding-settings';
import { readBrandStatusMessage } from '@/lib/server/startup-dashboard-status-messages';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

/**
 * Report-branding card on the startup settings tab. Server component: loads the current brand
 * straight from workspace metadata, forms post to `branding-actions`.
 */
export async function StartupBrandingSection(props: {
  readonly workspaceId: string | null;
  readonly canManage: boolean;
  readonly statusCode: string | undefined;
}) {
  const { workspaceId, canManage } = props;
  if (!workspaceId) return null;

  let view: BrandSettingsView | null = null;
  try {
    const env = await getScanApiEnv();
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      view = await getBrandSettingsView({
        supabase: supabase as never,
        scope: { table: 'startup_workspaces', id: workspaceId },
        publicBase: await resolveReportFilesPublicBase(),
      });
    }
  } catch {
    view = null;
  }

  const statusMessage = readBrandStatusMessage(props.statusCode);

  return (
    <article
      data-testid="startup-branding-section"
      className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Report branding</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Generated PDF reports carry this name, colour, and logo on the cover. Leave everything empty to
            use the GEO-Pulse default.
          </p>
        </div>
        {statusMessage ? (
          <p className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface">
            {statusMessage}
          </p>
        ) : null}
      </div>

      {!view ? (
        <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
          Branding settings could not be loaded for this workspace.
        </div>
      ) : !canManage ? (
        <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
          Founder or admin role required to change report branding.
          {view.companyName ? ` Current brand: ${view.companyName}.` : ''}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Identity</p>
            <form action={saveStartupBrandSettings} className="mt-3 space-y-3">
              <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
              <label className="block text-xs text-on-surface-variant">
                Company name
                <input
                  name="companyName"
                  defaultValue={view.companyName}
                  maxLength={80}
                  placeholder="Acme Inc."
                  className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                />
              </label>
              <label className="block text-xs text-on-surface-variant">
                Brand colour (hex)
                <input
                  name="primaryHex"
                  defaultValue={view.primaryHex}
                  placeholder="#1a2b3c"
                  className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                />
                <span className="mt-1 block text-[11px] text-on-surface-variant">
                  Cover text colour is derived automatically so the report stays readable.
                </span>
              </label>
              <label className="block text-xs text-on-surface-variant">
                Footer note (optional)
                <input
                  name="footerNote"
                  defaultValue={view.footerNote}
                  maxLength={160}
                  placeholder="Prepared by Acme for their clients"
                  className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-on-surface">
                <input
                  type="checkbox"
                  name="showPoweredBy"
                  defaultChecked={view.showPoweredBy}
                  className="h-4 w-4 rounded border-outline-variant"
                />
                Show &quot;Powered by GEO-Pulse&quot; on reports
              </label>
              <button
                type="submit"
                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90"
              >
                Save branding
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Logo</p>
            {view.logoKey ? (
              <div className="mt-2 flex items-center gap-3">
                {view.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- R2-hosted preview, size unknown at build time
                  <img
                    src={view.logoUrl}
                    alt="Current report logo"
                    className="h-12 max-w-[160px] rounded border border-outline-variant bg-white object-contain p-1"
                  />
                ) : null}
                <div className="text-xs text-on-surface-variant">
                  <p className="font-medium text-on-surface">Logo stored ({view.logoMime ?? 'image'})</p>
                  <form action={removeStartupBrandLogo} className="mt-1">
                    <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                    <button type="submit" className="underline transition hover:text-on-surface">
                      Remove logo
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-on-surface-variant">
                No logo stored — report covers use the company name as a text masthead.
              </p>
            )}

            <form action={uploadStartupBrandLogo} className="mt-4 space-y-2">
              <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
              <label className="block text-xs text-on-surface-variant">
                Upload PNG or JPEG (max 2 MB)
                <input
                  type="file"
                  name="logoFile"
                  accept="image/png,image/jpeg"
                  className="mt-1 w-full text-xs text-on-surface file:mr-3 file:rounded-lg file:border file:border-outline-variant file:bg-surface-container-low file:px-3 file:py-2 file:text-xs file:font-semibold file:text-on-surface"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
              >
                Upload logo
              </button>
            </form>

            <form action={importStartupBrandLogo} className="mt-4 space-y-2">
              <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
              <label className="block text-xs text-on-surface-variant">
                Or import from your website
                <input
                  name="logoUrl"
                  placeholder="https://example.com/logo.png"
                  className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
              >
                Import logo
              </button>
            </form>
          </div>
        </div>
      )}
    </article>
  );
}
