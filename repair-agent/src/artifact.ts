import type { ChangedFileEvidence } from './contracts';

export async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function digestChangedContent(
  changedFiles: readonly ChangedFileEvidence[],
  finalFiles: Readonly<Record<string, string>>
): Promise<string> {
  const manifest = await Promise.all([...changedFiles]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(async (file) => ({ path: file.path, sha256: await sha256Text(finalFiles[file.path] ?? '') })));
  return sha256Text(JSON.stringify(manifest));
}
