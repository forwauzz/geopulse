function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalize(item)]));
}

/** Portable non-cryptographic content identity; not used for security decisions. */
export function organizationContextContentHash(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value));
  let checksum = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    checksum ^= serialized.charCodeAt(index);
    checksum = Math.imul(checksum, 0x01000193);
  }
  return `fnv1a32:${(checksum >>> 0).toString(16).padStart(8, '0')}`;
}

export function organizationContextVersion(contentHash: string): string {
  return `ocv1-${contentHash.replace(/^fnv1a32:/, '')}`;
}
