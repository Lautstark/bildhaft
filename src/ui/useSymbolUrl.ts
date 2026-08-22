import { useCallback, useEffect, useState } from 'react';
import type { ProviderId } from '../core/types.ts';
import { getProvider } from '@lautstark/bildquelle';

/**
 * Process-wide cache of resolved image URLs. Rows, the slot picker and the print
 * sheet all render the same symbols, so resolving once per id matters — for
 * ARASAAC it saves network, for METACOM it saves re-reading from disk.
 */
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

const cacheKey = (provider: ProviderId, id: string) => `${provider}:${id}`;

/**
 * Resolution must not be able to hang. Every caller here awaits the database,
 * which can stall indefinitely if another tab is blocking a version upgrade.
 */
const RESOLVE_TIMEOUT_MS = 12_000;

export function peekSymbolUrl(provider: ProviderId, id: string): string | null {
  return cache.get(cacheKey(provider, id)) ?? null;
}

export function resolveSymbolUrl(provider: ProviderId, id: string): Promise<string | null> {
  const key = cacheKey(provider, id);

  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);

  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const task = Promise.race([
    getProvider(provider).getImageUrl(id),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), RESOLVE_TIMEOUT_MS)),
  ])
    .then((url) => {
      // Only successes are cached, so a later attempt can still succeed.
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

export type SymbolState = 'empty' | 'loading' | 'ready' | 'error';

export interface SymbolUrl {
  url: string | null;
  state: SymbolState;
  retry: () => void;
}

/**
 * Distinguishes "still loading" from "gave up". Collapsing the two meant any
 * failure showed an indistinguishable spinner that never resolved.
 */
export function useSymbolUrl(provider: ProviderId, id: string | null | undefined): SymbolUrl {
  const [url, setUrl] = useState<string | null>(() => (id ? peekSymbolUrl(provider, id) : null));
  const [state, setState] = useState<SymbolState>(() => {
    if (!id) return 'empty';
    return peekSymbolUrl(provider, id) ? 'ready' : 'loading';
  });
  const [nonce, setNonce] = useState(0);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!id) {
      setUrl(null);
      setState('empty');
      return;
    }

    const known = peekSymbolUrl(provider, id);
    if (known) {
      setUrl(known);
      setState('ready');
      return;
    }

    let alive = true;
    setUrl(null);
    setState('loading');

    resolveSymbolUrl(provider, id).then((next) => {
      if (!alive) return;
      setUrl(next);
      setState(next ? 'ready' : 'error');
    });

    return () => { alive = false; };
  }, [provider, id, nonce]);

  return { url, state, retry };
}
