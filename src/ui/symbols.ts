import type { ProviderId } from '../core/types.ts';
import { OWN_PREFIX, ownImageId, symbolIdFor } from '../core/types.ts';
import { getOwnImage } from '../db/repo.ts';
import { getProvider, metacom } from '@lautstark/bildquelle';
import { changes } from '@lautstark/werkzeuge/changed';

/**
 * Process-wide cache of resolved image URLs. Rows, the slot picker and the print
 * sheet all render the same symbols, so resolving once per id matters — for
 * ARASAAC it saves network, for METACOM it saves re-reading from disk.
 */
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

// The id helpers moved to core/types.ts, beside slotCaption, so that the print
// dialog can ask "which pictures does this job need" without reaching through
// a module that touches the DOM. Re-exported here because every caller that
// shows a symbol already imports this file.
export { ownImageId, symbolIdFor };

const cacheKey = (provider: ProviderId, id: string) =>
  (id.startsWith(OWN_PREFIX) ? `own:${id}` : `${provider}:${id}`);

/**
 * Resolution must not be able to hang. Every caller here awaits the database,
 * which can stall indefinitely if another tab is blocking a version upgrade.
 */
const RESOLVE_TIMEOUT_MS = 12_000;

export function peekSymbolUrl(provider: ProviderId, id: string): string | null {
  return cache.get(cacheKey(provider, id)) ?? null;
}

/**
 * A stored METACOM id is a path into the copy of the collection that was
 * indexed when the choice was made. The same folder acquired again later -
 * renamed, moved to another machine, picked as a directory handle where it was
 * once a file list - indexes different paths for the same pictures, and the
 * direct lookup misses. bildquelle 1.2 answers the name behind such a path
 * (most-specific match first, root-independent, ending at the bare stem), so a
 * miss asks by name before giving up. ARASAAC ids are opaque numbers and get
 * no second try.
 */
async function resolveUrl(provider: ProviderId, id: string): Promise<string | null> {
  if (id.startsWith(OWN_PREFIX)) {
    const image = await getOwnImage(id.slice(OWN_PREFIX.length));
    return image ? URL.createObjectURL(image.blob) : null;
  }

  const direct = await getProvider(provider).getImageUrl(id);
  if (direct || provider !== 'metacom') return direct;
  const path = metacom.idForName(id.replace(/\.[^.]+$/, ''));
  return path && path !== id ? metacom.getImageUrl(path) : null;
}

export function resolveSymbolUrl(provider: ProviderId, id: string): Promise<string | null> {
  const key = cacheKey(provider, id);

  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);

  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const task = Promise.race([
    resolveUrl(provider, id),
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

/*
 * Bumped when a source becomes usable again. Every mounted symbol watches it,
 * because nothing else about them changes: same provider, same id. Without it a
 * symbol that gave up once stays given up for the life of the page, which made
 * the "confirm access" button appear to do nothing at all.
 */
let generation = 0;

/* The same notifier db/repo.ts uses for the library, for a subject that has
 * nothing to do with backups — which is why @lautstark/werkzeuge/changed is a
 * factory rather than a module holding one Set. */
const reset = changes();

/** Makes every mounted symbol try again. */
export function resetSymbolResolution(provider?: ProviderId): void {
  if (provider) clearSymbolCache(provider);
  else cache.clear();
  pending.clear();
  generation += 1;
  reset.touched();
}

/** Subscribes to "a source became usable again"; returns an unsubscribe. */
export const onSymbolReset = reset.onChanged;

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

/**
 * Resolution, and nothing that draws.
 *
 * `symbolView()` stood under here until the move to components: a container, a
 * subscription to `onSymbolReset` and three states swapped into it by hand.
 * What it did is `src/pieces/Symbol.svelte` now — the same three states as
 * markup, and the subscription as an `$effect` that re-resolves when the id,
 * the provider or a source's return changes. The cache above is unchanged and
 * is still what makes a symbol cost one lookup however many places draw it.
 */
