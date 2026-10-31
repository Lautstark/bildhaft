import { beforeEach, describe, expect, it } from 'vitest';
import type { Sentence, Slot } from '../../src/core/types.ts';
import { clearEverything, createCollection, newId, putSentence, searchSentences } from '../../src/db/repo.ts';

/**
 * What the sidebar's search answers to besides a typed line.
 *
 * A card made with „+" — a Spiel's, a Tafel's, a Rezept's Zutat — was never
 * typed: its row is stored with an empty line and its word lives on the field.
 * The search read only the line, so every such card was unfindable.
 */

const field = (over: Partial<Slot> = {}): Slot => ({
  id: newId(), sourceToken: '', concept: '', origin: 'manual', choice: {}, candidates: {}, ...over,
});

const card = (collectionId: string, slots: Slot[], over: Partial<Sentence> = {}): Sentence => ({
  id: newId(), collectionId, rawInput: '', normalizedInput: '', slots, createdAt: 1, updatedAt: 1, ...over,
});

describe('searching cards that were never typed', () => {
  let id = '';
  beforeEach(async () => {
    await clearEverything();
    id = (await createCollection('Becherküche')).id;
  });

  it('finds a „+" card by the word under its symbol', async () => {
    await putSentence(card(id, [field({ sourceToken: 'Apfel', concept: 'apfel' })]));
    expect(await searchSentences('apfel')).toHaveLength(1);
  });

  it('finds it by the words it was given in place of the source\'s', async () => {
    await putSentence(card(id, [field({ sourceToken: 'Apfel', concept: 'apfel', label: 'Äpfelchen' })]));
    expect(await searchSentences('äpfelchen')).toHaveLength(1);
  });

  /* The title's symbols say what the material's name says; the name is found
     as a Material, and a second hit for the same words is noise. */
  it('leaves the symbols of a material\'s title out', async () => {
    await putSentence(card(id, [field({ sourceToken: 'Becher', concept: 'becher' })], { part: 'titel' }));
    expect(await searchSentences('becher')).toHaveLength(0);
  });
});
