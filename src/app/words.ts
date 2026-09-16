import type { Sentence } from '../core/types.ts';
import { normalizeInput } from '@lautstark/bildquelle/german';
import { listOverrides, newId, putSentence } from '../db/repo.ts';
import { t } from '../i18n/index.ts';
import { openSheet } from '../ui/sheet.svelte.ts';
import WortschatzPickBody from '../ui/WortschatzPickBody.svelte';
import { providerId, s } from './state.svelte.ts';
import { askFor } from './asking.svelte.ts';
import { notify } from './notify.ts';
import { refreshCollections } from './collections.ts';
import { persistSettings } from './settings.ts';

/** The Wortschatz as it reaches a Sammlung: pouring words in, and a new tag. */

/**
 * Pours words from the Wortschatz into the Sammlung that is open.
 *
 * This used to point the other way — „Sammlung daraus", standing in the
 * Wortschatz and making a new one. That only ever served the rarer half of
 * what people do with a pot of words. The commoner half is the Sammlung they
 * already have open, half full, with a name and a template they chose: they
 * want the Kita words *in it*, and then the Urlaub ones too, and then to keep
 * typing. Which is also why this can be done again and again and the other
 * could not.
 *
 * Copied, not referenced. A Sammlung printed and laminated in March does not
 * change because somebody swapped Oma's photo in June — the same rule a
 * written sentence is already under.
 */
async function handleAddWords(lens: string | null): Promise<void> {
  const collectionId = s.activeId;
  if (!collectionId || !s.settings) return;
  const source = providerId();

  const fold = (word: string) => word.trim().toLowerCase();
  const all = await listOverrides(source);
  const wanted = lens === null
    ? all
    : all.filter((entry) => entry.tags?.some((tag) => fold(tag) === fold(lens)));

  /* What is already in here, by the word rather than by the record. Adding
     the same tag twice is a thing somebody does by accident, and a Sammlung
     that answers it with a second Apfel is one they have to tidy by hand. */
  const held = new Set(s.sentences.flatMap(
    (sentence) => sentence.slots.map((slot) => fold(slot.sourceToken))));
  const owed = wanted.filter((entry) => !held.has(fold(entry.token)));

  if (owed.length === 0) { notify(t('ui.wortschatz_all_there')); return; }

  const now = Date.now();
  const made: Sentence[] = owed.map((entry, index) => ({
    id: newId(),
    normalizedInput: normalizeInput(entry.token),
    rawInput: entry.token,
    slots: [{
      id: newId(),
      sourceToken: entry.token,
      concept: entry.token.toLowerCase(),
      origin: 'override' as const,
      choice: { [source]: entry.symbolId },
      candidates: {},
      ...(entry.caption ? { label: entry.caption } : {}),
    }],
    collectionId,
    createdAt: now - index,
    updatedAt: now,
  }));
  await Promise.all(made.map((sentence) => putSentence(sentence)));

  s.sentences = [...made, ...s.sentences];
  await refreshCollections();
  notify(owed.length === 1
    ? t('ui.n_words_added_one')
    : t('ui.n_words_added', { n: owed.length }));
}

/**
 * Which words: everything, or one tag.
 *
 * A sheet rather than a submenu, because the answer is a list with counts and
 * a submenu of twenty tags is a menu somebody scrolls. Nothing is created
 * here and nothing is chosen twice — one press adds, and the sheet closes.
 */
export async function openWortschatzSheet(): Promise<void> {
  const all = await listOverrides(providerId());
  const tally = new Map<string, { label: string; n: number }>();
  for (const entry of all) {
    for (const tag of entry.tags ?? []) {
      const key = tag.toLowerCase();
      const seen = tally.get(key);
      if (seen) seen.n += 1;
      else tally.set(key, { label: tag, n: 1 });
    }
  }

  const sheet: { close(): void } = openSheet({
    title: t('ui.add_wortschatz'),
    state: {
      total: all.length,
      tags: [...tally.values()].sort((a, b) => a.label.localeCompare(b.label)),
      pick: (lens: string | null) => { sheet.close(); void handleAddWords(lens); },
    },
    body: WortschatzPickBody,
  });
}

/**
 * Makes a tag and opens it, the way „+ Neue Sammlung" makes a Sammlung.
 *
 * It exists the moment it is made, before it has a name anybody chose and
 * before a single word carries it — which is what `pinnedTags` is for, and
 * why the name is edited in the work head rather than asked for in a dialog
 * (§1.5). The number is only there so that making three in a row does not
 * produce three rows called the same thing.
 */
export async function handleNewTag(): Promise<void> {
  if (!s.settings) return;
  const taken = new Set(s.settings.pinnedTags.map((tag) => tag.toLowerCase()));
  let name = t('ui.new_tag_name');
  for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${t('ui.new_tag_name')} ${n}`;

  persistSettings({ ...s.settings, pinnedTags: [...s.settings.pinnedTags, name] });
  s.wortschatz = { tag: name };
  s.query = '';
  await refreshCollections();
  askFor('tag-name');
}
