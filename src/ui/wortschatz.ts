/**
 * The Wortschatz: the words this household has settled, each with its picture
 * and its tags, as a place of its own.
 *
 * It began as the body of a settings panel and is now what adr/0002 said it
 * would become — a row in the sidebar with a work head, a composer and a wall
 * of cards, the same three parts a Sammlung has. Which is the point: adding a
 * word is typing, and typing looks the same everywhere in this app.
 *
 * A tag is a lens, not a folder: one list, looked at through one tag at a time.
 * The filter row is `.chip` from components.css, whose rule says the same thing
 * — "a chip changes what is shown, never what is stored" — so the tags on a
 * card, which *are* stored, are deliberately not chips.
 */

import type { Candidate, Override, ProviderId, Slot } from '../core/types.ts';
import type { SymbolProvider } from '@lautstark/bildquelle';
import {
  deleteOverride, dropTag, listOverrides, newId, putOverride, putOwnImage, renameTag,
  setOverrideTags,
} from '../db/repo.ts';
import { el, fill } from './dom.ts';
import { topicsOf } from '../core/tags.ts';
import { ownImageId } from '../core/types.ts';
import { symbolView, type SymbolView } from './symbols.ts';
import { openSlotPicker } from './slotPicker.ts';
import { actionMenu } from './menu.ts';
import { typingBox } from './composer.ts';
import { renameField } from '@lautstark/design/rename';
import { t } from '../i18n/index.ts';

export interface WortschatzOptions {
  provider: () => SymbolProvider;
  providerId: () => ProviderId;
  /** The tags with a row of their own, and the way to change that list. */
  pinned: () => readonly string[];
  onPinned: (tags: string[]) => void;
  /** Counts moved, a tag was renamed — whatever the sidebar draws. */
  onChanged: () => void;
  /**
   * The lens changed from in here — a chip was pressed, or a tag was renamed
   * under the shell's feet. The sidebar row and the mobile title are the
   * shell's, and it cannot know without being told.
   */
  onLens: (tag: string | null) => void;
  notify: (message: string) => void;
}

export interface WortschatzUi {
  /** The children of `.main__inner`, in order, for the shell to place. */
  parts: HTMLElement[];
  /** Show every word, or one tag. Reads from the database. */
  open(tag: string | null): void;
  /** Re-read without changing which lens is on. */
  refresh(): void;
  /** Lets go of the symbol subscriptions. */
  destroy(): void;
  /**
   * Puts the caret in the title with the name selected, for a tag that was
   * just made and is called „Neuer Tag" until somebody says otherwise.
   */
  nameIt(): void;
}

const fold = (tag: string) => tag.trim().toLowerCase();

/** A word on its way to being an entry, for the picker, which speaks Slot. */
const asSlot = (token: string): Slot => ({
  id: newId(),
  sourceToken: token,
  concept: token.toLowerCase(),
  origin: 'manual',
  choice: {},
  candidates: {},
});

export function wortschatzView(options: WortschatzOptions): WortschatzUi {
  /** The tag being looked through, as written. `null` is all of them. */
  let lens: string | null = null;
  /** What the last read returned, so a write can merge rather than replace. */
  let entries: Override[] = [];
  /** Typed words the source had no picture for. Not entries yet — see add(). */
  let pending: string[] = [];
  let draft = '';
  let busy = false;
  /** The entry whose tag input is open, by key. One at a time. */
  let editing: string | null = null;

  const views: SymbolView[] = [];
  const letGo = () => { for (const view of views.splice(0)) view.destroy(); };

  /* ------------------------------------------------------------- head --- */

  const title = el('span', { class: 'work-title' });
  const titleInput = el('input', {
    class: 'title-input',
    attrs: { 'aria-label': t('ui.tag_name'), placeholder: t('ui.tag_name') },
  });
  /* Debounced while typing, written on blur and on Enter. Renaming a tag is a
     write to every entry carrying it, which is what makes the debounce worth
     more here than on a Sammlung's name. */
  const titleField = renameField(titleInput, (typed) => {
    const from = lens;
    if (!from || !typed.trim()) return undefined;
    lens = typed.trim();
    options.onPinned(options.pinned().map((tag) => (fold(tag) === fold(from) ? typed.trim() : tag)));
    options.onLens(lens);
    return renameTag(from, typed).then(() => { options.onChanged(); refresh(); });
  });

  const count = el('span', { class: 'small faint', style: { whiteSpace: 'nowrap' } });
  const menuHost = el('span');
  const head = el('div', { class: 'collection-head' });

  /* --------------------------------------------------------- composer --- */

  const box = typingBox({
    placeholder: t('ui.add_words_placeholder'),
    label: t('ui.add_words_label'),
    action: t('ui.add_words'),
    meta: [el('span', { html: t('ui.add_words_hint') })],
    onChange: (value) => { draft = value; box.show(draft, busy); },
    onSubmit: () => void add(),
  });

  const filters = el('div', { class: 'tag-filters' });
  const grid = el('div', { class: 'words' });
  /* Known tags, offered to every tag input on the page. One per view rather
     than one per card: the browser matches a datalist by id, so a second copy
     would be dead markup. */
  const known = el('datalist', { attrs: { id: 'wortschatz-tags' } });
  const body = el('div', { class: 'wortschatz' }, filters, grid, known);

  /* ------------------------------------------------------------ write --- */

  /**
   * Takes what is typed, one word per line.
   *
   * A word the source has no picture for is *not* written: an entry is a word
   * with a picture, and `symbolId` has nowhere to put "none". It waits in
   * `pending` as a card with a question mark instead — the same shape an
   * unresolved slot has in a Sammlung, and the same click opens the same
   * picker. That is where the proper nouns are, so it has to be one click and
   * not an apology.
   */
  async function add(): Promise<void> {
    const typed = [...new Set(draft.split('\n').map((line) => line.trim()).filter(Boolean))];
    if (typed.length === 0 || busy) return;

    busy = true;
    box.show(draft, busy);

    const held = new Map(entries.map((entry) => [entry.token, entry]));
    const missed: string[] = [];
    let added = 0;
    for (const word of typed) {
      const found = await options.provider().search(word).catch(() => []);
      const best = found[0];
      if (!best) { missed.push(word); continue; }
      await file(word, best, held.get(word.toLowerCase())?.tags ?? []);
      added += 1;
    }

    draft = '';
    busy = false;
    pending = [...new Set([...pending, ...missed])];
    box.show(draft, busy);
    if (added > 0) {
      options.notify(added === 1
        ? t('ui.n_words_added_one')
        : t('ui.n_words_added', { n: added }));
    }
    options.onChanged();
    refresh();
  }

  /** One word, one picture, plus the open tag if there is one. */
  async function file(word: string, candidate: Candidate, held: readonly string[]): Promise<void> {
    await putOverride(options.providerId(), word, candidate);
    if (lens) await setOverrideTags(options.providerId(), word, [...held, lens]);
  }

  function pick(word: string, held: readonly string[]): void {
    const done = () => {
      pending = pending.filter((one) => one !== word);
      options.onChanged();
      refresh();
    };
    openSlotPicker(asSlot(word), options.providerId(), {
      onChoose: (candidate) => void file(word, candidate, held).then(done),
      /* A picture of the person's own is the case this whole place exists for
         — Oma, Bello, Kita Sonnenschein — so it has to work here and not only
         inside a sentence. An entry points at it by the same prefixed id a
         Slot uses, which is why `symbolView` can already draw it. */
      onOwnImage: (picture, name) => void putOwnImage(picture, name)
        .then((image) => file(word, { id: ownImageId(image.id), label: word, score: 1000 }, held))
        .then(done),
      /* The rest of the picker acts on a Slot in a Sammlung: a crossed-out
         symbol and a caption belong to the field a word sits in, not to the
         word. Nothing here to do, and nothing to pretend. */
      onClearOwnImage: () => undefined,
      onNegate: () => undefined,
      onLabel: () => undefined,
      onRemove: () => undefined,
      onClose: () => undefined,
    });
  }

  async function retag(entry: Override, tags: string[]): Promise<void> {
    editing = null;
    await setOverrideTags(entry.provider, entry.token, tags);
    options.onChanged();
    refresh();
  }

  /* ------------------------------------------------------------- read --- */

  function open(tag: string | null): void {
    lens = tag;
    pending = [];
    paintComposer();
    refresh();
  }

  /** Opened from in here rather than from the sidebar, so the shell is told. */
  function go(tag: string | null): void {
    open(tag);
    options.onLens(tag);
  }

  /* The placeholder says what typing here will do, and in a tag that is one
     thing more than adding a word. */
  function paintComposer(): void {
    box.setPlaceholder(lens
      ? t('ui.add_words_to_tag_placeholder', { tag: lens })
      : t('ui.add_words_placeholder'));
  }

  function refresh(): void {
    letGo();
    void listOverrides(options.providerId()).then(paint);
  }

  const tagsOf = (entry: Override) => entry.tags ?? [];

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

  function paint(read: Override[]): void {
    letGo();
    entries = read;

    /* A pinned tag that nothing carries any more is still a tag: it was made on
       purpose and is a row in the sidebar. So the lens survives an empty
       result, and only an unpinned one falls back to everything. */
    if (lens && !options.pinned().some((tag) => fold(tag) === fold(lens ?? ''))
      && !read.some((entry) => tagsOf(entry).some((tag) => fold(tag) === fold(lens ?? '')))) {
      lens = null;
    }

    paintHead(read);
    paintFilters(read);

    const shown = lens === null
      ? read
      : read.filter((entry) => tagsOf(entry).some((tag) => fold(tag) === fold(lens ?? '')));

    if (shown.length === 0 && pending.length === 0) {
      fill(grid, el('div', { class: 'empty' },
        el('b', { text: lens ? t('ui.tag_empty') : t('ui.no_entries') }),
        el('small', { text: lens ? t('ui.tag_empty_hint') : t('ui.wortschatz_empty_hint') })));
      return;
    }
    fill(grid, ...pending.map(waiting), ...shown.map(card));
  }

  function paintHead(read: Override[]): void {
    const shown = lens === null
      ? read.length
      : read.filter((entry) => tagsOf(entry).some((tag) => fold(tag) === fold(lens ?? ''))).length;
    count.textContent = shown === 1 ? t('ui.n_words_one') : t('ui.n_words', { n: shown });

    if (lens === null) {
      title.textContent = t('ui.all_words');
      fill(head, title, count);
      return;
    }
    titleField.refresh(lens);
    fill(menuHost, actionMenu(t('ui.tag_actions'), (item) => {
      item(t('ui.unpin_tag'), () => {
        options.onPinned(options.pinned().filter((tag) => fold(tag) !== fold(lens ?? '')));
        options.onChanged();
      });
      item(t('ui.delete_tag'), () => void deleteLens(), { danger: true });
    }));
    fill(head, titleInput, count, menuHost);
  }

  async function deleteLens(): Promise<void> {
    const gone = lens;
    if (!gone) return;
    options.onPinned(options.pinned().filter((tag) => fold(tag) !== fold(gone)));
    await dropTag(gone);
    lens = null;
    options.onLens(null);
    paintComposer();
    options.onChanged();
    refresh();
  }

  function paintFilters(read: Override[]): void {
    // First spelling wins for display; the count is over the folded form. A
    // suggested tag counts exactly like a typed one — a lens does not care who
    // said the word, only which entries carry it.
    const own = new Map<string, { label: string; n: number }>();
    const said = new Map<string, { label: string; n: number }>();
    const bump = (into: Map<string, { label: string; n: number }>, tag: string) => {
      const seen = into.get(fold(tag));
      if (seen) seen.n += 1;
      else into.set(fold(tag), { label: tag, n: 1 });
    };
    for (const entry of read) {
      for (const tag of tagsOf(entry)) bump(own, tag);
      for (const tag of suggestedFor(entry)) bump(said, tag);
    }
    // A pinned tag with nothing in it still has a chip, or the row in the
    // sidebar would lead somewhere the filter row says does not exist.
    for (const tag of options.pinned()) if (!own.has(fold(tag))) own.set(fold(tag), { label: tag, n: 0 });

    fill(known, ...[...own.values(), ...said.values()]
      .map((tag) => el('option', { attrs: { value: tag.label } })));

    if (own.size === 0 && said.size === 0) { fill(filters); return; }

    const chip = (label: string, n: number, on: boolean, pin: boolean) => {
      const node = el('button', {
        class: 'chip', text: label,
        attrs: { type: 'button', 'aria-pressed': String(on) },
        on: { click: () => go(label === t('ui.filter_all') ? null : label) },
      }, el('span', { class: 'n', text: String(n) }));
      /* The pin sits on the chip that is on, and only on a tag somebody typed.
         A suggested one is a wording — „Nomen" is „Noun" tomorrow — and a
         sidebar row remembering a word this app translated is a row that
         empties itself when the interface changes language. */
      if (on && pin) {
        const held = options.pinned().some((tag) => fold(tag) === fold(label));
        node.append(el('span', {
          class: 'chip__pin', text: '📌',
          attrs: { role: 'button', tabindex: '0',
            title: held ? t('ui.unpin_tag') : t('ui.pin_tag'),
            'aria-label': held ? t('ui.unpin_tag') : t('ui.pin_tag') },
          style: { opacity: held ? '1' : '.45' },
          on: {
            click: (event) => {
              event.stopPropagation();
              options.onPinned(held
                ? options.pinned().filter((tag) => fold(tag) !== fold(label))
                : [...options.pinned(), label]);
              options.onChanged();
              refresh();
            },
          },
        }));
      }
      return node;
    };

    const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
    fill(filters,
      chip(t('ui.filter_all'), read.length, lens === null, false),
      ...(own.size > 0 ? [el('span', { class: 'tag-filters__sep' })] : []),
      ...[...own.values()].sort(byLabel)
        .map((tag) => chip(tag.label, tag.n, lens !== null && fold(lens) === fold(tag.label), true)),
      ...(said.size > 0 ? [el('span', { class: 'tag-filters__sep' })] : []),
      ...[...said.values()].sort(byLabel)
        .map((tag) => chip(tag.label, tag.n, lens !== null && fold(lens) === fold(tag.label), false)),
    );
  }

  /* ------------------------------------------------------------ cards --- */

  function waiting(word: string): HTMLElement {
    return el('div', { class: 'word word--waiting' },
      el('button', {
        class: 'word__pic word__pic--asking', text: '?',
        attrs: { type: 'button', 'aria-label': t('ui.pick_picture_for', { word }) },
        on: { click: () => pick(word, []) },
      }),
      el('b', { class: 'word__name', text: word }),
      el('span', { class: 'tags' },
        el('button', { class: 'tag tag--ask', text: t('ui.pick_picture'),
          attrs: { type: 'button' }, on: { click: () => pick(word, []) } })),
    );
  }

  function card(entry: Override): HTMLElement {
    const view = symbolView({ provider: entry.provider, id: entry.symbolId, alt: entry.label });
    views.push(view);

    return el('div', { class: 'word' },
      el('button', {
        class: 'word__pic',
        attrs: { type: 'button', 'aria-label': t('ui.change_picture_for', { word: entry.token }) },
        on: { click: () => pick(entry.token, tagsOf(entry)) },
      }, view.node),
      el('button', {
        class: 'word__drop', text: '×',
        attrs: { type: 'button', 'aria-label': t('ui.remove_word', { word: entry.token }) },
        on: { click: async () => {
          await deleteOverride(entry.provider, entry.token);
          options.onChanged();
          refresh();
        } },
      }),
      el('b', { class: 'word__name', text: entry.token }),
      el('span', { class: 'tags' },
        ...tagsOf(entry).map((tag) => badge(entry, tag)),
        ...suggestedFor(entry).map((tag) => el('span', { class: 'tag tag--auto', text: tag })),
        adder(entry)),
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
    queueMicrotask(() => input.focus());

    function commit(): void {
      const typed = input.value.trim();
      if (!typed) { editing = null; refresh(); return; }
      void retag(entry, [...tagsOf(entry), typed]);
    }
    return input;
  }

  paintComposer();
  box.show(draft, busy);
  return {
    parts: [box.node, head, body],
    open,
    refresh,
    destroy: letGo,
    nameIt: () => { titleInput.focus(); titleInput.select(); },
  };
}
