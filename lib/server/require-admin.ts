import { redirect } from 'next/navigation';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAdminEmail(userEmail: string | null | undefined): boolean {
  const admin = process.env['ADMIN_EMAIL'];
  if (!admin) return false;
  if (!userEmail) return false;
  return normalizeEmail(userEmail) === normalizeEmail(admin);
}

export function requireAdminOrRedirect(userEmail: string | null | undefined): void {
  if (!isAdminEmail(userEmail)) {
    redirect('/dashboard');
  }
}

