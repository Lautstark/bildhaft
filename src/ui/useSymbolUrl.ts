import { useEffect, useState } from 'react';
import type { ProviderId } from '../core/types.ts';
import { getProvider } from '../providers/registry.ts';

/**
 * Process-wide cache of resolved image URLs. Rows, the slot picker and the print
 * sheet all render the same symbols, so resolving once per id matters — for
 * ARASAAC it saves network, for METACOM it saves re-reading from disk.
 */
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

const cacheKey = (provider: ProviderId, id: string) => `${provider}:${id}`;

export function peekSymbolUrl(provider: ProviderId, id: string): string | null {
  return cache.get(cacheKey(provider, id)) ?? null;
}

export function resolveSymbolUrl(provider: ProviderId, id: string): Promise<string | null> {
  const key = cacheKey(provider, id);

  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);

  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const task = getProvider(provider)
    .getImageUrl(id)
    .then((url) => {
      if (url) cache.set(key, url);
      return url;
    })
    .catch(() => null)
    .finally(() => pending.delete(key));

  pending.set(key, task);
  return task;
}

/** Dropped when a provider is reconfigured and its object URLs are revoked. */
export function clearSymbolCache(provider: ProviderId): void {
  const prefix = `${provider}:`;
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
}

/**
 * Resolves every id up front. Called before window.print() so the browser never
 * opens its print dialog over half-loaded images.
 */
export async function warmSymbols(provider: ProviderId, ids: string[]): Promise<void> {
  await Promise.all([...new Set(ids)].map((id) => resolveSymbolUrl(provider, id)));
}

export function useSymbolUrl(provider: ProviderId, id: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? peekSymbolUrl(provider, id) : null));

  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }

    const known = peekSymbolUrl(provider, id);
    if (known) {
      setUrl(known);
      return;
    }

    let alive = true;
    setUrl(null);
    resolveSymbolUrl(provider, id).then((next) => {
      if (alive) setUrl(next);
    });
    return () => {
      alive = false;
    };
  }, [provider, id]);

  return url;
}
