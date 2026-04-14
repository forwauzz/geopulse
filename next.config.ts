import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

void initOpenNextCloudflareForDev();

/** Next.js `next dev` (Fast Refresh) requires eval; strict CSP breaks the app + Turnstile. Production build omits unsafe-eval. */
const isDev = process.env['NODE_ENV'] === 'development';
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com"
  : "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com";

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
