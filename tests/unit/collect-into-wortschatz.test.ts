import { beforeEach, describe, expect, it } from 'vitest';
import * as repo from '../../src/db/repo.ts';
import type { Sentence } from '../../src/core/types.ts';

/**
 * A Sammlung's words going the other way — into the Wortschatz, tagged by where
 * they came from.
 *
 * The rule worth holding is what happens to a word that is already there. What
 * is in the Wortschatz is what the household settled on, and a Sammlung — even
 * one of their own — is not a reason to overrule it. „Oma" with a photograph
 * must not become a pictogram because a shopping list mentioned her; she gains
 * the tag and keeps her face.
 */
const row = (collectionId: string, tokens: string[], title?: string): Sentence => ({
  id: repo.newId(),
  collectionId,
  rawInput: tokens.join(', '),
  normalizedInput: tokens.join(' ').toLowerCase(),
  ...(title ? { title } : {}),
  slots: tokens.map((token, n) => ({
    id: repo.newId(),
    sourceToken: token,
    concept: token.toLowerCase(),
    origin: 'lemma' as const,
    choice: { arasaac: `${900 + n}` },
    candidates: {},
  })),
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

describe('a Sammlung going into the Wortschatz', () => {
  beforeEach(async () => { await repo.clearEverything(); });

  it('files every word under the tags it is given', async () => {
    const made = await repo.createCollection('Einkaufsliste');
    const out = await repo.collectIntoWortschatz(
      'arasaac', [row(made.id, ['Apfel', 'Banane'], 'Obst')],
      (sentence) => ['Einkaufsliste', ...(sentence.title ? [sentence.title] : [])],
    );
    expect(out).toEqual({ added: 2, tagged: 0 });

    const held = await repo.listOverrides('arasaac');
    expect(held.map((one) => one.token).sort()).toEqual(['apfel', 'banane']);
    expect(held[0]?.tags).toEqual(['Einkaufsliste', 'Obst']);
  });

  it('leaves a word that is already there with its own picture', async () => {
    await repo.putOverride('arasaac', 'Oma', { id: 'own:photo', label: 'Oma', score: 1 });
    await repo.setOverrideCaption('arasaac', 'Oma', 'Omi');

    const made = await repo.createCollection('Einkaufsliste');
    const out = await repo.collectIntoWortschatz(
      'arasaac', [row(made.id, ['Oma'])], () => ['Einkaufsliste'],
    );
    expect(out).toEqual({ added: 0, tagged: 1 });

    const oma = (await repo.listOverrides('arasaac'))[0];
    // The tag arrived; nothing else moved.
    expect(oma?.tags).toEqual(['Einkaufsliste']);
    expect(oma?.symbolId).toBe('own:photo');
    expect(oma?.caption).toBe('Omi');
  });

  it('does not add a tag an entry already carries', async () => {
    const made = await repo.createCollection('Einkaufsliste');
    const one = row(made.id, ['Apfel']);
    await repo.collectIntoWortschatz('arasaac', [one], () => ['Einkaufsliste']);
    expect(await repo.collectIntoWortschatz('arasaac', [one], () => ['Einkaufsliste']))
      .toEqual({ added: 0, tagged: 0 });
  });

  it('skips a word with no symbol, because an entry is what can be drawn', async () => {
    const made = await repo.createCollection('Einkaufsliste');
    const empty = row(made.id, ['Senf']);
    empty.slots[0]!.choice = {};
    expect(await repo.collectIntoWortschatz('arasaac', [empty], () => ['Einkaufsliste']))
      .toEqual({ added: 0, tagged: 0 });
    expect(await repo.listOverrides('arasaac')).toHaveLength(0);
  });
});
