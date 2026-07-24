import {
  importAgencyBrandLogo,
  removeAgencyBrandLogo,
  saveAgencyBranding,
  uploadAgencyBrandLogo,
} from '@/app/dashboard/workspace/agency-branding-actions';
import type { BrandSettingsView } from '@/lib/server/report-branding-settings';

const STATUS: Record<string, string> = {
  saved: 'Branding saved.',
  logo_saved: 'Logo saved.',
  logo_removed: 'Logo removed.',
  forbidden: 'Your role cannot change agency branding.',
  storage_unavailable: 'Logo storage is temporarily unavailable.',
  logo_invalid: 'Use a valid PNG or JPEG logo.',
  brand_invalid_color: 'Enter a valid hex colour such as #1a2b3c.',
};

export function AgencyBrandingSettings({
  accountId,
  view,
  status,
}: {
  readonly accountId: string;
  readonly view: BrandSettingsView;
  readonly status?: string;
}) {
  return (
    <section className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-float md:p-6">
      <div>
        <h2 className="font-headline text-lg font-bold text-on-background">Client report branding</h2>
        <p className="mt-1 text-sm text-on-surface-variant">Your name, colour, and logo appear on every new agency PDF.</p>
      </div>
      {status && STATUS[status] ? <p className="mt-4 rounded-xl bg-primary/10 px-4 py-3 text-sm text-on-background">{STATUS[status]}</p> : null}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <form action={saveAgencyBranding} className="space-y-4 rounded-xl bg-surface-container-low p-4">
          <input type="hidden" name="agencyAccountId" value={accountId} />
          <label className="block text-sm font-medium text-on-background">Agency name
            <input name="companyName" defaultValue={view.companyName} maxLength={80} placeholder="Your Agency" className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium text-on-background">Brand colour
            <div className="mt-2 flex gap-2">
              <input type="color" name="primaryHex" defaultValue={view.primaryHex || '#b08d3c'} className="h-11 w-14 rounded-lg border border-outline-variant/20 bg-transparent p-1" />
              <span className="flex items-center text-sm text-on-surface-variant">{view.primaryHex || '#b08d3c'}</span>
            </div>
          </label>
          <label className="block text-sm font-medium text-on-background">Footer note
            <input name="footerNote" defaultValue={view.footerNote} maxLength={160} placeholder="Prepared for your client by Your Agency" className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2.5" />
          </label>
          <label className="flex items-center gap-2 text-sm text-on-background">
            <input type="checkbox" name="showPoweredBy" defaultChecked={view.showPoweredBy} className="h-4 w-4 accent-primary" />
            Show “Powered by GEO-Pulse”
          </label>
          <button className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary">Save branding</button>
        </form>
        <div className="rounded-xl bg-surface-container-low p-4">
          <p className="text-sm font-medium text-on-background">Logo</p>
          {view.logoKey ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              {view.logoUrl ? <img src={view.logoUrl} alt="Agency logo" className="h-14 max-w-[180px] rounded-lg bg-white object-contain p-2" /> : <span className="text-sm text-on-surface-variant">Logo stored</span>}
              <form action={removeAgencyBrandLogo}><input type="hidden" name="agencyAccountId" value={accountId} /><button className="text-sm text-on-surface-variant underline">Remove</button></form>
            </div>
          ) : <p className="mt-2 text-sm text-on-surface-variant">No logo uploaded yet.</p>}
          <form action={uploadAgencyBrandLogo} className="mt-5 space-y-2">
            <input type="hidden" name="agencyAccountId" value={accountId} />
            <input type="file" name="logoFile" accept="image/png,image/jpeg" className="w-full text-sm text-on-surface-variant file:mr-3 file:rounded-lg file:border-0 file:bg-surface-container-high file:px-3 file:py-2" />
            <button className="rounded-xl border border-outline-variant/20 px-4 py-2 text-sm font-semibold text-on-background">Upload logo</button>
          </form>
          <form action={importAgencyBrandLogo} className="mt-5 space-y-2 border-t border-outline-variant/10 pt-5">
            <input type="hidden" name="agencyAccountId" value={accountId} />
            <label className="block text-sm text-on-surface-variant">Or import from a direct image URL
              <input name="logoUrl" type="url" placeholder="https://agency.com/logo.png" className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2.5" />
            </label>
            <button className="rounded-xl border border-outline-variant/20 px-4 py-2 text-sm font-semibold text-on-background">Import logo</button>
          </form>
        </div>
      </div>
    </section>
  );
}
