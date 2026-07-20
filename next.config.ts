import { existsSync } from 'node:fs';
import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

// Exposes real Cloudflare bindings to `next dev` by starting a wrangler session. The app depends
// on these — above all the `vars` feature flags — so this must run in CI too, or every page
// renders as if every flag were off.
//
// Workers AI has no local simulation (AI models always run on Cloudflare), so the `ai` binding
// forces that session into remote mode and it demands an account login. CI has none, and must not:
// this is a public repo, so fork PRs could not use a token, and Workers AI bills the account even
// in local dev. So CI runs against a derived config with just that one binding stripped — see
// scripts/wrangler-config-for-ci.mjs. Nothing in the e2e suite touches the AI path.
const ciWranglerConfig = 'wrangler.ci.jsonc';
const useCiConfig = Boolean(process.env['CI']) && existsSync(ciWranglerConfig);
void initOpenNextCloudflareForDev(useCiConfig ? { configPath: ciWranglerConfig } : undefined);

/** Next.js `next dev` (Fast Refresh) requires eval; strict CSP breaks the app + Turnstile. Production build omits unsafe-eval. */
const isDev = process.env['NODE_ENV'] === 'development';
// https://static.cloudflareinsights.com/beacon.min.js is auto-injected by Cloudflare Web Analytics.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://static.cloudflareinsights.com"
  : "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com";

function publicOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const reportAssetOrigin = publicOrigin(process.env['DEEP_AUDIT_R2_PUBLIC_BASE']);
const connectSrc = [
  "'self'",
  'https://*.supabase.co',
  'https://generativelanguage.googleapis.com',
  'https://cloudflareinsights.com', // Web Analytics beacon POST target
  ...(reportAssetOrigin ? [reportAssetOrigin] : []),
].join(' ');

const nextConfig: NextConfig = {
  // Required for @opennextjs/cloudflare
  // Do NOT set output: 'export' — OpenNext handles the build

  // Security headers — applied to all routes
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            // Start with a permissive CSP — tighten after launch
            // Add your Turnstile domain and Supabase domain here
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: https:",
              "font-src 'self' https://fonts.gstatic.com",
              `connect-src ${connectSrc}`,
              "frame-src https://challenges.cloudflare.com",
            ].join('; '),
          },
        ],
      },
    ];
  },

  // Redirect http to https (belt + suspenders — CF handles this too)
  async redirects() {
    return [];
  },

  // Image optimization: Cloudflare Workers does not support next/image sharp
  // Use <img> tags directly or Cloudflare Image Resizing
  images: {
    unoptimized: true,
  },

  // Experimental: Server Actions are stable in Next.js 15
  // No experimental flags needed for core features

  typescript: {
    // CI/CD should fail on type errors — do not ignoreBuildErrors
    ignoreBuildErrors: false,
  },

  eslint: {
    ignoreDuringBuilds: false,
  },
} satisfies NextConfig;

export default nextConfig;
