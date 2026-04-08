import { cache } from 'react';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';

/**
 * Per-request deduplication of `loadAdminPageContext` so a route layout and page can share
 * one admin resolution + service-role client setup without duplicate work.
 */
export const getAdminPageContext = cache(async (nextPath: string) => loadAdminPageContext(nextPath));
