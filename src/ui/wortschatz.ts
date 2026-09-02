/**
 * The Wortschatz as a list: the words this household has settled, each with its
 * picture and its tags.
 *
 * It is a module of its own rather than more of settingsDialog.ts because of
 * where it is going. adr/0002 makes the Wortschatz a place in the sidebar; the
 * settings panel is its first host and currently its only one, and nothing in
 * here knows it is inside a panel.
 *
 * A tag is a lens, not a folder: one list, looked at through one tag at a time.
 * The filter row is `.chip` from components.css, whose rule says the same thing
 * — "a chip changes what is shown, never what is stored" — so the tags on a row,
 * which *are* stored, are deliberately not chips.
 */

import type { Override, ProviderId } from '../core/types.ts';
import { deleteOverride, listOverrides, setOverrideTags } from '../db/repo.ts';
import { el, fill } from './dom.ts';
import { topicsOf } from '../core/tags.ts';
import { symbolView, type SymbolView } from './symbols.ts';
import { t } from '../i18n/index.ts';

export interface WortschatzListOptions {
  /** The source whose entries are shown, read afresh at every repaint. */
  provider: () => ProviderId;
  /** How many entries the list holds, for a host that states a count. */
  onCount?: (count: number) => void;
}

export interface WortschatzList {
  /** The element to place. Fills itself; call `refresh` to (re)read. */
  node: HTMLElement;
  refresh(): void;
  /** Lets go of the symbol subscriptions. A host that closes must call it. */
  destroy(): void;
}

const fold = (tag: string) => tag.trim().toLowerCase();

export function wortschatzList(options: WortschatzListOptions): WortschatzList {
  const filters = el('div', { class: 'tag-filters' });
  const list = el('div', { class: 'dict' });
  /* Known tags, offered to every tag input on the page. One per list rather
     than one per row: the browser matches a datalist by id, so a second copy
     would be dead markup. */
  const known = el('datalist', { attrs: { id: 'wortschatz-tags' } });
  const node = el('div', {}, filters, list, known);

  const views: SymbolView[] = [];
  /** The tag being looked through, folded. `null` is all of them. */
  let lens: string | null = null;
  /** The entry whose tag input is open, by key. One at a time. */
  let editing: string | null = null;

  function letGo(): void {
    for (const view of views.splice(0)) view.destroy();
  }

  function refresh(): void {
    letGo();
    fill(list, el('p', { class: 'small muted', text: t('ui.loading') }));
    void listOverrides(options.provider()).then(paint);
  }

  function tagsOf(entry: Override): string[] {
    return entry.tags ?? [];
  }

  /**
   * What the source suggests this word is, already in the reader's language.
   *
   * Derived at every repaint rather than stored, because these are wordings and
   * the interface has two languages — see the note on `Override.categories`.
   * ARASAAC's own vocabulary is mapped onto our themes; METACOM's is the
   * person's folder names and is shown as it stands, because replacing what
   * somebody called a thing with what we would have called it is not a
   * translation.
   *
   * A suggestion a person has also typed themselves is dropped here: it is the
   * same tag, and one of them has a way to be removed.
   */
  function suggestedFor(entry: Override): string[] {
    const said: string[] = [];
    if (entry.wordClass) {
      said.push(t(entry.wordClass === 'noun' ? 'ui.wordclass_noun' : 'ui.wordclass_verb'));
    }
    said.push(...(entry.provider === 'arasaac'
      ? topicsOf(entry.categories).map((topic) => t(`ui.topic_${topic}`))
      : entry.categories ?? []));

    const own = new Set(tagsOf(entry).map(fold));
    return said.filter((tag) => !own.has(fold(tag)));
  }

  async function retag(entry: Override, tags: string[]): Promise<void> {
    editing = null;
    await setOverrideTags(entry.provider, entry.token, tags);
    refresh();
  }

  function paint(entries: Override[]): void {
    letGo();
    options.onCount?.(entries.length);

    if (entries.length === 0) {
      lens = null;
      fill(filters);
      fill(known);
      fill(list, el('div', { class: 'empty' },
        el('b', { text: t('ui.no_entries') }),
        el('small', { text: t('ui.dictionary_empty_hint') })));
      return;
    }

    // First spelling wins for display; the count is over the folded form. A
    // suggested tag counts exactly like a typed one — a lens does not care who
    // said the word, only which entries carry it.
    const tally = new Map<string, { label: string; n: number }>();
    for (const entry of entries) {
      for (const tag of [...tagsOf(entry), ...suggestedFor(entry)]) {
        const seen = tally.get(fold(tag));
        if (seen) seen.n += 1;
        else tally.set(fold(tag), { label: tag, n: 1 });
      }
    }
    // The last word of a tag having been untagged takes the lens with it,
    // rather than leaving a filter on that nothing can satisfy.
    if (lens !== null && !tally.has(lens)) lens = null;

    fill(known, ...[...tally.values()].map((tag) => el('option', { attrs: { value: tag.label } })));
    paintFilters(entries.length, tally);

    const shown = lens === null
      ? entries
      : entries.filter((entry) => [...tagsOf(entry), ...suggestedFor(entry)]
        .some((tag) => fold(tag) === lens));
    fill(list, ...shown.map(row));
  }

  function paintFilters(total: number, tally: Map<string, { label: string; n: number }>): void {
    // Nothing is tagged yet, so there is nothing to look through. A row holding
    // only „Alle" is a control that cannot change anything.
    if (tally.size === 0) { fill(filters); return; }

    const chip = (label: string, n: number, on: boolean, pick: () => void) =>
      el('button', {
        class: 'chip', text: label,
        attrs: { type: 'button', 'aria-pressed': String(on) },
        on: { click: () => { pick(); refresh(); } },
      }, el('span', { class: 'n', text: String(n) }));

    fill(filters,
      chip(t('ui.filter_all'), total, lens === null, () => { lens = null; }),
      ...[...tally.entries()]
        .sort((a, b) => a[1].label.localeCompare(b[1].label))
        .map(([key, tag]) => chip(tag.label, tag.n, lens === key, () => { lens = key; })));
  }

  function row(entry: Override): HTMLElement {
    /* The picture, not just its name. A list of words pointing at labels is a
       record of what was decided; the pictures are the thing itself. */
    const view = symbolView({ provider: entry.provider, id: entry.symbolId, alt: entry.label });
    views.push(view);

    return el('div', { class: 'dict__row' },
      el('span', { class: 'slot__img dict__pic' }, view.node),
      el('div', { class: 'dict__word' },
        el('b', { text: entry.token }),
        el('span', { class: 'small muted', text: entry.label }),
        el('div', { class: 'tags' },
          ...tagsOf(entry).map((tag) => badge(entry, tag)),
          ...suggestedFor(entry).map((tag) => el('span', { class: 'tag tag--auto', text: tag })),
          adder(entry))),
      el('button', { class: 'btn destructive sm', text: t('ui.remove'), attrs: { type: 'button' },
        on: { click: async () => { await deleteOverride(entry.provider, entry.token); refresh(); } } }),
    );
  }

  function badge(entry: Override, tag: string): HTMLElement {
    return el('span', { class: 'tag' },
      el('span', { text: tag }),
      el('button', {
        class: 'tag__x', text: '×',
        attrs: { type: 'button', 'aria-label': t('ui.remove_tag', { tag }) },
        on: { click: () => void retag(entry, tagsOf(entry).filter((held) => fold(held) !== fold(tag))) },
      }));
  }

  function adder(entry: Override): HTMLElement {
    if (editing !== entry.key) {
      return el('button', {
        class: 'tag tag--add', text: t('ui.add_tag'), attrs: { type: 'button' },
        on: { click: () => { editing = entry.key; refresh(); } },
      });
    }

    const input = el('input', {
      class: 'tag-input',
      attrs: { type: 'text', list: 'wortschatz-tags', placeholder: t('ui.tag_name'),
        'aria-label': t('ui.tag_name'), autocomplete: 'off', spellcheck: 'false' },
      on: {
        keydown: (event: KeyboardEvent) => {
          if (event.key === 'Enter') { event.preventDefault(); commit(); }
          else if (event.key === 'Escape') { editing = null; refresh(); }
        },
        /* Committing on the way out rather than asking for a save button: by
           §1.5 the thing is made when it is named, and a typed word that
           vanishes because the person clicked elsewhere is a word they will
           type twice. Empty simply closes. */
        blur: () => commit(),
      },
    });
    // Focus after the browser has the node, or there is nothing to focus.
    queueMicrotask(() => input.focus());

    function commit(): void {
      const typed = input.value.trim();
      if (!typed) { editing = null; refresh(); return; }
      void retag(entry, [...tagsOf(entry), typed]);
    }
    return input;
  }

  return { node, refresh, destroy: letGo };
}
