import 'server-only';

import { buildTextSample, parsePageSignals } from '../../workers/scan-engine/parse-signals';
import { fetchPage } from '../../workers/scan-engine/fetch-page';
import {
  guardConfirmedOrganizationContext,
  resolveExactDomain,
  serviceLabelsFromHtml,
  supportingPageUrls,
  type ExactDomainResolution,
} from '../intelligence/organization-resolver';
import type { OrganizationContext } from '../intelligence/organization-context';

type FetchPageLike = typeof fetchPage;

export type ResolveOrganizationWebsiteResult =
  | { readonly ok: true; readonly resolution: ExactDomainResolution }
  | { readonly ok: false; readonly reason: string };

/** SSRF-gated, read-only exact-site resolver. It performs no enrichment, storage write, or profile overwrite. */
export async function resolveOrganizationWebsite(args: {
  readonly url: string;
  readonly approvedAliasHosts?: readonly string[];
  readonly observedAt?: string;
  readonly confirmedContext?: Pick<OrganizationContext, 'organization' | 'market' | 'status'>;
  readonly fetchPageImpl?: FetchPageLike;
}): Promise<ResolveOrganizationWebsiteResult> {
  const fetched = await (args.fetchPageImpl ?? fetchPage)(args.url);
  if (!fetched.ok) return { ok: false, reason: `exact_site_fetch_failed:${fetched.reason}` };
  const signals = parsePageSignals(fetched.html);
  const rootDomain = new URL(fetched.finalUrl).hostname.replace(/^www\./i, '').toLowerCase();
  const supportingPages = (await Promise.all(supportingPageUrls(fetched.html, fetched.finalUrl).map(async (url) => {
    const page = await (args.fetchPageImpl ?? fetchPage)(url);
    if (!page.ok || new URL(page.finalUrl).hostname.replace(/^www\./i, '').toLowerCase() !== rootDomain) return null;
    const pageSignals = parsePageSignals(page.html);
    return {
      url: page.finalUrl,
      title: pageSignals.title,
      jsonLdTypes: pageSignals.jsonLdTypes,
      jsonLdBlocks: pageSignals.jsonLdBlocks,
      htmlLang: pageSignals.htmlLang,
      hreflangEntries: pageSignals.hreflangEntries,
      textSample: buildTextSample(page.html),
      publicEmail: /href=["']mailto:([^"'?\s]+)(?:\?[^"']*)?["']/i.exec(page.html)?.[1] ?? null,
      publicTelephone: /href=["']tel:([^"'\s]+)["']/i.exec(page.html)?.[1] ?? null,
    };
  }))).filter((page): page is NonNullable<typeof page> => Boolean(page));
  const publicEmail = /href=["']mailto:([^"'?\s]+)(?:\?[^"']*)?["']/i.exec(fetched.html)?.[1] ?? null;
  const publicTelephone = /href=["']tel:([^"'\s]+)["']/i.exec(fetched.html)?.[1] ?? null;
  const resolution = resolveExactDomain({
    requestedUrl: args.url,
    finalUrl: fetched.finalUrl,
    redirectChain: fetched.redirectChain,
    approvedAliasHosts: args.approvedAliasHosts,
    title: signals.title,
    siteName: /<meta[^>]+(?:property|name)=["'](?:og:site_name|application-name)["'][^>]+content=["']([^"']+)["']/i.exec(fetched.html)?.[1]
      ?? /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:site_name|application-name)["']/i.exec(fetched.html)?.[1]
      ?? null,
    canonicalHref: signals.canonicalHref,
    jsonLdTypes: signals.jsonLdTypes,
    jsonLdBlocks: signals.jsonLdBlocks,
    htmlLang: signals.htmlLang,
    hreflangEntries: signals.hreflangEntries,
    textSample: buildTextSample(fetched.html),
    publicEmail,
    publicTelephone,
    supportingPages,
    serviceLabels: serviceLabelsFromHtml(fetched.html, fetched.finalUrl),
    observedAt: args.observedAt ?? new Date().toISOString(),
  });
  if ('error' in resolution) return { ok: false, reason: resolution.error };
  return {
    ok: true,
    resolution: args.confirmedContext
      ? guardConfirmedOrganizationContext(resolution, args.confirmedContext)
      : resolution,
  };
}
