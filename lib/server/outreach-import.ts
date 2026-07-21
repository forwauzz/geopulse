/**
 * Prospect list import (issue #94) — paste or upload the companies you have already
 * been in contact with; the existing outreach cadence engine does the rest.
 *
 * Deliberately simple: a line-based parser, the existing (email,url) upsert for
 * dedupe, and the sweep's own 10-per-tick limit as natural pacing. No new tables,
 * no new engine.
 *
 * Accepted line shapes (comma, semicolon, or tab separated):
 *   email, url
 *   email, url, name
 *   email, url, name, company
 *   email, url, name, company, cadence   (hourly|daily|weekly|monthly)
 * A header row containing "email" is skipped automatically. Blank lines and
 * #comments are ignored.
 */
import { normalizeOutreachCadence, type OutreachCadence } from './outreach';

export interface ImportedProspect {
  email: string;
  url: string;
  name: string | null;
  company: string | null;
  cadence: OutreachCadence;
}

export interface ImportParseResult {
  rows: ImportedProspect[];
  invalid: { line: number; text: string; reason: string }[];
  skippedHeader: boolean;
}

const MAX_ROWS = 500;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Shared by the importer AND the add-prospect form so the same site always stores identically. */
export function normalizeProspectUrl(raw: string): string | null {
  return normalizeUrl(raw);
}

function normalizeUrl(raw: string): string | null {
  let candidate = raw.trim();
  if (!candidate) return null;
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname.includes('.')) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function parseProspectImport(text: string): ImportParseResult {
  const result: ImportParseResult = { rows: [], invalid: [], skippedHeader: false };
  const seen = new Set<string>();

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = (lines[i] ?? '').trim();
    if (!raw || raw.startsWith('#')) continue;

    const parts = raw.split(/[,;\t]/).map((p) => p.trim().replace(/^["']|["']$/g, ''));
    const first = (parts[0] ?? '').toLowerCase();

    // Header row: skip silently wherever it appears — an uploaded CSV's header lands
    // mid-text when pasted text precedes it, and "email" can never be a real address.
    if (first === 'email') {
      result.skippedHeader = true;
      continue;
    }

    if (result.rows.length >= MAX_ROWS) {
      result.invalid.push({ line: i + 1, text: raw.slice(0, 80), reason: `import cap of ${String(MAX_ROWS)} rows reached` });
      continue;
    }

    const email = (parts[0] ?? '').toLowerCase();
    if (!EMAIL_RE.test(email)) {
      result.invalid.push({ line: i + 1, text: raw.slice(0, 80), reason: 'invalid email in column 1' });
      continue;
    }

    const url = normalizeUrl(parts[1] ?? '');
    if (!url) {
      result.invalid.push({ line: i + 1, text: raw.slice(0, 80), reason: 'invalid website in column 2' });
      continue;
    }

    const key = `${email}|${url}`;
    if (seen.has(key)) {
      result.invalid.push({ line: i + 1, text: raw.slice(0, 80), reason: 'duplicate of an earlier line' });
      continue;
    }
    seen.add(key);

    result.rows.push({
      email,
      url,
      name: parts[2]?.trim() || null,
      company: parts[3]?.trim() || null,
      cadence: normalizeOutreachCadence(parts[4]),
    });
  }

  return result;
}
