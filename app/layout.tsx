import type { Metadata } from 'next';
import { Inter, Newsreader } from 'next/font/google';
import './globals.css';
import { AttributionInit } from '@/components/attribution-init';
import { LongWaitProvider } from '@/components/long-wait-provider';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  weight: ['400', '700'],
});

export const metadata: Metadata = {
  title: 'GEO-Pulse — AI Search Readiness',
  description: 'Free AI Search Readiness audit for your site.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var d=t?t:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.classList.toggle('dark',d==='dark');}catch(e){}})();",
          }}
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,300,0,0&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${inter.variable} ${newsreader.variable} flex min-h-screen flex-col overflow-x-hidden bg-surface font-body text-on-surface antialiased`}
      >
        <LongWaitProvider>
          <AttributionInit />
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </LongWaitProvider>
      </body>
    </html>
  );
}
