import type { Sentence } from '../core/types.ts';
import { normalizeInput } from '@lautstark/bildquelle/german';
import { listOverrides, newId, putSentence } from '../db/repo.ts';
import { t } from '../i18n/index.ts';
import { el } from '../ui/dom.ts';
import { openDialog } from '../ui/dialog.ts';
import { providerId } from './state.ts';
import type { Ctx } from './context.ts';

export interface Words extends Pick<Ctx, 'openWortschatzSheet'> {
  handleNewTag(): Promise<void>;
}

/** The Wortschatz as it reaches a Sammlung: pouring words in, and a new tag. */
export function words(ctx: Ctx): Words {
  const { s } = ctx;

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
    const source = providerId(s);

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

    if (owed.length === 0) { ctx.notify(t('ui.wortschatz_all_there')); return; }

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
    await ctx.refreshCollections();
    ctx.render();
    ctx.notify(owed.length === 1
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
  async function openWortschatzSheet(): Promise<void> {
    const all = await listOverrides(providerId(s));
    const tally = new Map<string, { label: string; n: number }>();
    for (const entry of all) {
      for (const tag of entry.tags ?? []) {
        const key = tag.toLowerCase();
        const seen = tally.get(key);
        if (seen) seen.n += 1;
        else tally.set(key, { label: tag, n: 1 });
      }
    }

    const row = (label: string, n: number, lens: string | null) => el('button', {
      class: 'btn quiet wortschatz-pick',
      attrs: { type: 'button', ...(n === 0 ? { disabled: true } : {}) },
      on: { click: () => { sheet.close(); void handleAddWords(lens); } },
    },
    el('b', { text: label }),
    el('span', { class: 'small faint', text: n === 1 ? t('ui.n_words_one') : t('ui.n_words', { n }) }));

    const sheet = openDialog({
      title: t('ui.add_wortschatz'),
      body: [
        el('p', { class: 'small muted', style: { marginTop: '0' }, text: t('ui.add_wortschatz_note') }),
        el('div', { class: 'wortschatz-picks' },
          row(t('ui.all_words'), all.length, null),
          ...[...tally.values()]
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((tag) => row(tag.label, tag.n, tag.label))),
      ],
      onClose: () => undefined,
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
  async function handleNewTag(): Promise<void> {
    if (!s.settings) return;
    const taken = new Set(s.settings.pinnedTags.map((tag) => tag.toLowerCase()));
    let name = t('ui.new_tag_name');
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${t('ui.new_tag_name')} ${n}`;

    ctx.persistSettings({ ...s.settings, pinnedTags: [...s.settings.pinnedTags, name] });
    s.wortschatz = { tag: name };
    s.query = '';
    ctx.views.words.open(name);
    await ctx.refreshCollections();
    ctx.render();
    ctx.views.words.nameIt();
  }

  return { openWortschatzSheet, handleNewTag };
}
