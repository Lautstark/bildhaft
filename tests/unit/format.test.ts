import { describe, expect, it } from 'vitest';
import {
  FORMAT, FORMAT_STEPS, formatOf, holdsNewer, upgradeLibrary, type FormatStep, type Library,
} from '../../src/core/format.ts';
import type { Collection, Override, Sentence } from '../../src/core/types.ts';

const collection = (id: string, more: Partial<Collection> = {}): Collection =>
  ({ id, name: id, createdAt: 1, updatedAt: 1, ...more });
const sentence = (id: string, collectionId: string, more: Partial<Sentence> = {}): Sentence =>
  ({ id, collectionId, normalizedInput: id, rawInput: id, slots: [], createdAt: 1, updatedAt: 1, ...more });
const override = (key: string, more: Partial<Override> = {}): Override =>
  ({ key, token: key, provider: 'arasaac', symbolId: '1', label: key, updatedAt: 1, ...more } as Override);

const library = (more: Partial<Library> = {}): Library =>
  ({ collections: [], sentences: [], overrides: [], ...more });

/* Two invented steps. The first renames every due row, the second reads the
   Sammlung a row lies in — the thing the real next step has to do. */
const rename: FormatStep = {
  to: 2,
  run: (held, due) => ({
    ...held,
    sentences: held.sentences.map((row) => (due(row) ? { ...row, rawInput: `${row.rawInput}!` } : row)),
  }),
};
const fromCollection: FormatStep = {
  to: 3,
  run: (held, due) => ({
    ...held,
    sentences: held.sentences.map((row) => (due(row)
      ? { ...row, title: held.collections.find((c) => c.id === row.collectionId)?.name ?? '?' }
      : row)),
  }),
};

describe('the format of a record', () => {
  it('reads a record that says nothing as the first format', () => {
    expect(formatOf(sentence('a', 'c'))).toBe(1);
    expect(formatOf({ v: 3 })).toBe(3);
  });

  it('has a step for every format this build writes', () => {
    // adr/0004: a format nobody described a step for is one no file can reach.
    expect(FORMAT_STEPS.map((step) => step.to)).toEqual(
      Array.from({ length: FORMAT - 1 }, (_, i) => i + 2),
    );
  });
});

describe('upgradeLibrary', () => {
  it('leaves a library alone that is already there, and names nothing as changed', () => {
    const held = library({ collections: [collection('c')], sentences: [sentence('a', 'c')] });
    const { library: after, changed } = upgradeLibrary(held, [], 1);
    expect(after).toBe(held);
    expect(changed).toEqual(library());
  });

  it('runs the steps in order and stamps what they brought up', () => {
    const held = library({ collections: [collection('c')], sentences: [sentence('a', 'c')] });
    const { library: after } = upgradeLibrary(held, [fromCollection, rename], 3);
    expect(after.sentences[0]).toMatchObject({ rawInput: 'a!', title: 'c', v: 3 });
    expect(after.collections[0]!.v).toBe(3);
  });

  it('touches only the records that are behind', () => {
    const there = sentence('new', 'c', { v: 2 });
    const held = library({ sentences: [sentence('old', 'c'), there] });
    const { library: after, changed } = upgradeLibrary(held, [rename], 2);
    expect(after.sentences.map((row) => row.rawInput)).toEqual(['old!', 'new']);
    expect(after.sentences[1]).toBe(there);
    expect(changed.sentences.map((row) => row.id)).toEqual(['old']);
  });

  it('names every record it brought up as changed, of every kind', () => {
    const held = library({
      collections: [collection('c')], sentences: [sentence('a', 'c')], overrides: [override('de:arasaac:a')],
    });
    const { changed } = upgradeLibrary(held, [rename], 2);
    expect(changed.collections.map((c) => c.id)).toEqual(['c']);
    expect(changed.sentences.map((row) => row.id)).toEqual(['a']);
    expect(changed.overrides.map((o) => o.key)).toEqual(['de:arasaac:a']);
  });

  it('does nothing the second time', () => {
    const held = library({ collections: [collection('c')], sentences: [sentence('a', 'c')] });
    const once = upgradeLibrary(held, [rename, fromCollection], 3).library;
    const twice = upgradeLibrary(once, [rename, fromCollection], 3);
    expect(twice.library).toBe(once);
    expect(twice.changed).toEqual(library());
  });

  it('refuses a format with no step rather than skipping it', () => {
    const held = library({ sentences: [sentence('a', 'c')] });
    expect(() => upgradeLibrary(held, [fromCollection], 3)).toThrow(/2/);
  });

  it('refuses a library that holds a record from a newer build', () => {
    const held = library({ sentences: [sentence('a', 'c', { v: 4 })] });
    expect(holdsNewer(held, 3)).toBe(true);
    expect(() => upgradeLibrary(held, [rename, fromCollection], 3)).toThrow();
    expect(holdsNewer(library({ sentences: [sentence('a', 'c', { v: 3 })] }), 3)).toBe(false);
  });
});
