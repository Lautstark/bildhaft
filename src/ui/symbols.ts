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

/*
 * Which of the cached URLs are this file's to give back.
 *
 * An own picture's URL is made here, by `URL.createObjectURL`, and holds its
 * bytes in memory until somebody revokes it — nobody else knows it exists. The
 * symbol sources' URLs are bildquelle's, which keeps and revokes its own, so
 * revoking one of those here would blank a picture another part of the page
 * is still drawing from the same cache.
 */
const isOwnKey = (key: string): boolean => key.startsWith(`own:${OWN_PREFIX}`);

function forget(key: string): void {
  const url = cache.get(key);
  if (url && isOwnKey(key)) URL.revokeObjectURL(url);
  cache.delete(key);
}

export function resolveSymbolUrl(provider: ProviderId, id: string): Promise<string | null> {
  const key = cacheKey(provider, id);

  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);

  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  /*
   * The lookup goes on after the clock gives up on it — nothing here can stop
   * a database read — and for an own picture what it ends in is a fresh object
   * URL. Nobody was waiting for that one any more, so it is revoked as it
   * arrives rather than left holding the bytes for the life of the page.
   */
  let gaveUp = false;
  const lookup = resolveUrl(provider, id);
  void lookup.then((url) => {
    if (gaveUp && url && isOwnKey(key)) URL.revokeObjectURL(url);
  }, () => undefined);

  const task: Promise<string | null> = Promise.race([
    lookup,
    new Promise<null>((resolve) => setTimeout(() => { gaveUp = true; resolve(null); }, RESOLVE_TIMEOUT_MS)),
  ])
    .then((url) => {
      if (!url) return url;
      /* Two lookups of one key can both be out — one started before a reset
         cleared `pending` and one after — and the second to land would
         overwrite the first's URL in the cache and orphan it. The first one
         in stays; a second own URL for the same picture is given back. */
      const held = cache.get(key);
      if (held && held !== url) {
        if (isOwnKey(key)) URL.revokeObjectURL(url);
        return held;
      }
      // Only successes are cached, so a later attempt can still succeed.
      cache.set(key, url);
      return url;
    })
    .catch(() => null)
    /* Only its own entry. A reset clears `pending` while a lookup is out, a
       newer lookup for the same key takes the slot, and the older one's
       finally used to delete *that* — so a third caller started a third
       lookup instead of waiting on the second. */
    .finally(() => { if (pending.get(key) === task) pending.delete(key); });

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
  else for (const key of [...cache.keys()]) forget(key);
  pending.clear();
  generation += 1;
  reset.touched();
}

/** Subscribes to "a source became usable again"; returns an unsubscribe. */
export const onSymbolReset = reset.onChanged;

/** What `followSymbolUrl` hands back: the unsubscribe, and the way to say the
 *  URL it showed would not load. */
export interface FollowedSymbol {
  stop: () => void;
  broke: (url: string) => void;
}

/**
 * One picture's URL, for something that draws it without being a `Symbol`: a
 * card on the sheet, a Rezept's title picture. Shown at once when the cache
 * knows it, when it resolves if not, and again whenever a source becomes
 * usable — the sheet used to skip that last part, so a sheet drawn while the
 * folder could not be read stayed blank until „Bearbeiten“ drew it afresh.
 *
 * A URL that would not load is looked up once more, fresh: see
 * `dropSymbolUrl`. Once, so a picture that is broken in itself ends blank
 * instead of asking for ever.
 */
export function followSymbolUrl(
  provider: ProviderId, id: string, show: (url: string | null) => void,
): FollowedSymbol {
  let attempt = 0;
  let stopped = false;
  /* The one that would not load. Asked again, a source that still holds it
     live answers with the same one, which would only break again. */
  let broken: string | null = null;
  const offer = (url: string | null): void => show(url === broken ? null : url);
  const load = (): void => {
    const known = peekSymbolUrl(provider, id);
    if (known) { offer(known); return; }
    const mine = ++attempt;
    show(null);
    void resolveSymbolUrl(provider, id).then((found) => {
      if (!stopped && mine === attempt && found) offer(found);
    });
  };
  const stopReset = onSymbolReset(() => { broken = null; load(); });
  load();
  return {
    stop: () => { stopped = true; stopReset(); },
    broke: (url) => {
      if (stopped) return;
      if (broken !== null) { show(null); return; }
      broken = url;
      dropSymbolUrl(provider, id, url);
      load();
    },
  };
}

/**
 * Forgets a URL that would not load, so the next lookup asks the source again.
 *
 * bildquelle keeps 400 object URLs alive and revokes the oldest when it makes
 * the next one, without telling anybody. The cache here went on handing out
 * the revoked one, and every picture drawn from it after that was broken —
 * the sheet after a long session, a row whose lazy picture loaded late. Only
 * this URL: one a newer lookup has already replaced is left alone.
 */
export function dropSymbolUrl(provider: ProviderId, id: string, url: string): void {
  const key = cacheKey(provider, id);
  if (cache.get(key) === url) forget(key);
}

/**
 * A URL known without asking any source: the Prüfseite's test symbols, which
 * are drawn into data URLs and must reach the sheet without network or store.
 */
export function primeSymbolUrl(provider: ProviderId, id: string, url: string): void {
  cache.set(cacheKey(provider, id), url);
}

/** Dropped when a provider is reconfigured and its object URLs are revoked. */
export function clearSymbolCache(provider: ProviderId): void {
  const prefix = `${provider}:`;
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) forget(key);
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
