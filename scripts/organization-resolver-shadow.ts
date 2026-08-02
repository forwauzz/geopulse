import {
  resolveExactDomain,
  serviceLabelsFromHtml,
  supportingPageUrls,
} from '../lib/intelligence/organization-resolver';
import { fetchPage } from '../workers/scan-engine/fetch-page';
import { buildTextSample, parsePageSignals } from '../workers/scan-engine/parse-signals';

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main(): Promise<void> {
  const url = argument('url');
  if (!url) {
    console.error('Usage: npm run intelligence:organization:resolve -- --url=https://example.com [--aliases=alias.example.com]');
    process.exitCode = 1;
    return;
  }

  const fetched = await fetchPage(url);
  if (!fetched.ok) {
    console.error(JSON.stringify({ ok: false, reason: `exact_site_fetch_failed:${fetched.reason}` }, null, 2));
    process.exitCode = 1;
    return;
  }
  const signals = parsePageSignals(fetched.html);
  const rootHost = new URL(fetched.finalUrl).hostname.replace(/^www\./i, '').toLowerCase();
  const supportingPages = (await Promise.all(supportingPageUrls(fetched.html, fetched.finalUrl).map(async (pageUrl) => {
    const page = await fetchPage(pageUrl);
    if (!page.ok || new URL(page.finalUrl).hostname.replace(/^www\./i, '').toLowerCase() !== rootHost) return null;
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
  const resolution = resolveExactDomain({
    requestedUrl: url,
    finalUrl: fetched.finalUrl,
    redirectChain: fetched.redirectChain,
    approvedAliasHosts: (argument('aliases') ?? '').split(',').map((value) => value.trim()).filter(Boolean),
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
    publicEmail: /href=["']mailto:([^"'?\s]+)(?:\?[^"']*)?["']/i.exec(fetched.html)?.[1] ?? null,
    publicTelephone: /href=["']tel:([^"'\s]+)["']/i.exec(fetched.html)?.[1] ?? null,
    supportingPages,
    serviceLabels: serviceLabelsFromHtml(fetched.html, fetched.finalUrl),
    observedAt: new Date().toISOString(),
  });
  console.log(JSON.stringify('error' in resolution ? { ok: false, reason: resolution.error } : { ok: true, resolution }, null, 2));
  if ('error' in resolution || resolution.status === 'conflicted') process.exitCode = 2;
}

void main();
