import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The object URLs an own picture is drawn from are this page's to give back.
 *
 * `URL.createObjectURL` keeps the picture's bytes alive until the URL is
 * revoked, and only `ui/symbols.ts` knows the URL exists. Three ways it used
 * to keep them for the life of the page: a reset dropped the cache without
 * revoking what was in it, a lookup that answered after the 12-second clock
 * made a URL nobody was waiting for, and two lookups of one key overwrote each
 * other's. The fourth case is the queue of lookups in flight: an old lookup
 * finishing after a reset deleted the newer lookup's entry.
 *
 * The store and the symbol source are stood in for, because what is asserted
 * is when a lookup answers — which a real IndexedDB does not let a test choose.
 */
const lookups: { id: string; answer: (blob: unknown) => void }[] = [];
vi.mock('../../src/db/repo.ts', () => ({
  getOwnImage: (id: string) => new Promise((resolve) => {
    lookups.push({ id, answer: (blob) => resolve(blob ? { id, blob } : undefined) });
  }),
}));

const sourceAnswers: ((url: string | null) => void)[] = [];
vi.mock('@lautstark/bildquelle', () => ({
  getProvider: () => ({
    getImageUrl: () => new Promise<string | null>((resolve) => { sourceAnswers.push(resolve); }),
  }),
  metacom: { idForName: () => null, getImageUrl: () => null },
}));

const symbols = await import('../../src/ui/symbols.ts');

describe('the URLs an own picture is drawn from', () => {
  let made: string[] = [];
  let revoked: string[] = [];

  beforeEach(() => {
    made = [];
    revoked = [];
    lookups.length = 0;
    sourceAnswers.length = 0;
    let n = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:own-${++n}`;
      made.push(url);
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => { revoked.push(url); });
    symbols.resetSymbolResolution();
    revoked = [];
  });

  afterEach(() => vi.useRealTimers());

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('gives one back when a reset drops it from the cache', async () => {
    const asked = symbols.resolveSymbolUrl('arasaac', 'own:oma');
    lookups[0]!.answer(new Blob(['png']));
    const url = await asked;
    expect(url).toBe(made[0]);

    symbols.resetSymbolResolution();

    expect(revoked).toEqual([url]);
  });

  it('gives back one that arrives after the page stopped waiting for it', async () => {
    vi.useFakeTimers();
    const asked = symbols.resolveSymbolUrl('arasaac', 'own:oma');
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await asked).toBeNull();

    lookups[0]!.answer(new Blob(['png']));
    await vi.advanceTimersByTimeAsync(0);

    expect(made).toHaveLength(1);
    expect(revoked).toEqual(made);
    expect(symbols.peekSymbolUrl('arasaac', 'own:oma')).toBeNull();
  });

  it('leaves a source’s URLs to the source', async () => {
    const asked = symbols.resolveSymbolUrl('arasaac', '2483');
    sourceAnswers[0]!('https://example.invalid/2483.png');
    await asked;

    symbols.resetSymbolResolution();

    expect(revoked).toEqual([]);
  });

  it('does not let a lookup from before a reset clear the newer one in flight', async () => {
    const before = symbols.resolveSymbolUrl('arasaac', '2483');
    symbols.resetSymbolResolution();
    const after = symbols.resolveSymbolUrl('arasaac', '2483');

    // The old lookup lands while the new one is still out.
    sourceAnswers[0]!(null);
    await before;
    await settle();

    // A third caller waits on the second lookup instead of starting another.
    expect(symbols.resolveSymbolUrl('arasaac', '2483')).toBe(after);
    expect(sourceAnswers).toHaveLength(2);
  });
});
