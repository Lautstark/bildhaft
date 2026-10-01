import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sentence } from '../../src/core/types.ts';

/**
 * A line sent again after its write timed out is one row, not two.
 *
 * The composer stops waiting for a store write after ten seconds and puts the
 * line back in the box. The write is not cancelled — nothing can take an
 * IndexedDB request back — so a store stalled behind another tab's upgrade
 * lands it later all the same. Pressing Enter on the line that came back used
 * to write it again under a fresh id, and the Sammlung had it twice.
 *
 * The store is stood in for by a map with a write that can be held, because
 * the whole question is what happens when a write answers late.
 */
const stored = new Map<string, Sentence>();
let holdNext = false;
const held: (() => void)[] = [];

vi.mock('../../src/db/repo.ts', async (original) => ({
  ...(await original<typeof import('../../src/db/repo.ts')>()),
  overrideMap: async () => new Map(),
  putSentence: (sentence: Sentence) => {
    const land = () => { stored.set(sentence.id, sentence); };
    if (!holdNext) { land(); return Promise.resolve(); }
    holdNext = false;
    return new Promise<void>((resolve) => { held.push(() => { land(); resolve(); }); });
  },
}));
// The lookup is beside the point and would otherwise ask ARASAAC.
vi.mock('../../src/core/match.ts', async (original) => ({
  ...(await original<typeof import('../../src/core/match.ts')>()),
  buildSlots: async () => [],
}));

const { addLines } = await import('../../src/app/composing.ts');
const { s } = await import('../../src/app/state.svelte.ts');
const { defaultSettings } = await import('../../src/db/repo.ts');

describe('a line whose write timed out, sent again', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stored.clear();
    held.length = 0;
    s.settings = defaultSettings();
    s.collections = [{ id: 'c1', name: 'Test', createdAt: 0, updatedAt: 0 }];
    s.activeId = 'c1';
    s.sentences = [];
    s.busy = false;
  });

  afterEach(() => vi.useRealTimers());

  async function send(text: string): Promise<string> {
    const left = addLines(text);
    await vi.advanceTimersByTimeAsync(10_000);
    return left;
  }

  it('lands as one row when the late write lands first', async () => {
    holdNext = true;
    expect(await send('Hallo')).toBe('Hallo');

    held[0]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(await send('Hallo')).toBe('');

    expect(stored.size).toBe(1);
    expect(s.sentences).toHaveLength(1);
  });

  it('lands as one row when the late write lands last', async () => {
    holdNext = true;
    await send('Hallo');
    await send('Hallo');

    held[0]!();
    await vi.advanceTimersByTimeAsync(0);

    expect(stored.size).toBe(1);
  });

  it('still makes two rows of a line that is there twice', async () => {
    expect(await send('La la la\nLa la la')).toBe('');
    expect(stored.size).toBe(2);
  });
});
