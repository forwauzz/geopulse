import type { Metadata } from 'next';
import Link from 'next/link';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-geist-sans',
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
      <body className={`${inter.variable} min-h-screen font-sans antialiased`}>
        <header className="flex justify-end gap-4 border-b border-geo-mist/20 px-6 py-3 text-sm text-geo-mist">
          <Link href="/login" className="hover:text-geo-ink">
            Sign in
          </Link>
          <Link href="/dashboard" className="hover:text-geo-ink">
            Dashboard
          </Link>
        </header>
        {children}
      </body>
    </html>
  );
}
