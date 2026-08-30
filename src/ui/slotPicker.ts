import type { Candidate, ProviderId, Slot } from '../core/types.ts';
import { ownImageId } from '../core/types.ts';
import { getProvider, metacom } from '@lautstark/bildquelle';
import { el, fill } from './dom.ts';
import { openDialog } from './dialog.ts';
import { cropName, cropSquare } from './crop.ts';
import type { Cropper } from './crop.ts';
import { symbolView, type SymbolView } from './symbols.ts';
import { t } from '../i18n/index.ts';

export interface PickerHandlers {
  onChoose: (candidate: Candidate) => void;
  /**
   * A picture of the user's own, taking the place of any symbol.
   *
   * A Blob and a name rather than the File they used to arrive in, because what
   * is kept is no longer always what was chosen: a picture that went through the
   * square is one bildhaft drew. The name still comes from the file, so the
   * library stays readable.
   */
  onOwnImage: (picture: Blob, name: string) => void;
  onClearOwnImage: () => void;
  /** Lays a red cross over the symbol — METACOM's "nicht". Leaves the dialog open. */
  onNegate: (negated: boolean) => void;
  /**
   * The words under the symbol. Empty means the word the sentence used.
   * Leaves the dialog open: the wording is a property of the field, and a
   * person setting one is usually still looking for the right picture.
   */
  onLabel: (label: string) => void;
  /** Removes the whole slot, not just its symbol. */
  onRemove: () => void;
  onClose: () => void;
}

export function openSlotPicker(slot: Slot, provider: ProviderId, handlers: PickerHandlers): void {
  const stored = slot.candidates[provider] ?? [];
  /*
   * Nothing is marked while an own picture is showing. The symbol underneath is
   * still remembered — removing the picture uncovers it — but highlighting it
   * would claim the slot shows something it does not.
   */
  const chosen = slot.ownImage ? null : slot.choice[provider] ?? null;
  const isNew = !slot.concept;

  let suggested: Candidate[] = stored;
  /*
   * True once a button has decided the outcome. The dialog reports every close,
   * including the ones these buttons cause — without this guard a pick fired the
   * dismissal handler first, which discarded the very slot being filled.
   */
  let settled = false;
  let views: SymbolView[] = [];
  let labelTimer: number | undefined;
  /** The caption typed but not yet written through, or null for nothing pending. */
  let pending: string | null = null;
  let searchTimer: number | undefined;
  let searchToken = 0;

  const status = el('p', { class: 'small muted', style: { margin: '12px 0 0' } });
  const grid = el('div', { class: 'picker__grid' });

  /*
   * A file of the user's own. bildhaft keeps the bytes rather than a path, so
   * moving or deleting the original afterwards changes nothing here.
   */
  const upload = el('input', {
    attrs: { type: 'file', accept: 'image/*', hidden: true },
    on: {
      change: () => {
        const file = upload.files?.[0];
        upload.value = '';
        if (!file) return;
        /*
         * The dialog used to settle here, on the file alone. It stays open for
         * the square instead — see beginCrop below — and settles on the press
         * that keeps one.
         *
         * No crop offered is not a failure and gets no sentence: the picture was
         * already square, or the browser could not read a size off it, and both
         * mean the file goes exactly as it did before this step existed.
         */
        void cropSquare(file).then(
          (cutter) => {
            if (cutter) beginCrop(cutter, file.name);
            else finish(() => handlers.onOwnImage(file, file.name));
          },
          () => finish(() => handlers.onOwnImage(file, file.name)));
      },
    },
  });

  /*
   * The picture the field is actually showing.
   *
   * It was the one thing this dialog would not show. Nothing here is marked
   * while an own picture is up — the suggestions below are what the slot would
   * fall back to, not what it holds — so opening a field that had a photograph
   * in it presented a search for a word and no photograph anywhere, and read as
   * having lost it. It is shown where the buttons that change it are, because
   * "keep, replace, remove" is one decision and needs the picture in front of it.
   */
  const ownView = slot.ownImage
    ? symbolView({ provider, id: ownImageId(slot.ownImage), alt: t('ui.own_picture') })
    : null;
  if (ownView) views.push(ownView);

  const ownRow = el('div', { class: 'picker__own' },
    ownView ? el('span', { class: 'slot__img picker__own-shown' }, ownView.node) : null,
    el('label', { class: 'btn sm', text: t('ui.own_picture_choose'), style: { cursor: 'pointer' } },
      upload),
    slot.ownImage
      ? el('button', { class: 'btn sm destructive', text: t('ui.own_picture_remove'),
          attrs: { type: 'button' }, on: { click: () => finish(handlers.onClearOwnImage) } })
      : null,
  );

  /*
   * Negation is a property of the field, not a different symbol, so it does not
   * settle the dialog the way picking one does: cross it out, see it, carry on.
   * Hidden for a field that has nothing in it yet — there is nothing to cross.
   */
  const negateBox = el('input', {
    attrs: { type: 'checkbox', checked: slot.negated ?? false },
    on: { change: () => handlers.onNegate(negateBox.checked) },
  });
  // An empty span rather than null: the dialog's body takes nodes, not blanks.
  const negateRow = isNew ? el('span') : el('div', { class: 'picker__negate' },
    el('label', { class: 'opt__check' }, negateBox, t('ui.cross_out')),
  );

  /*
   * The words that get printed. A field of its own rather than a rewrite of the
   * source word, so a correction stays remembered under the word that was typed.
   * The placeholder is what would print without it, which is what makes an empty
   * field readable as "unchanged" — and clearing it is therefore the reset.
   */
  const captionInput = el('input', {
    class: 'field',
    attrs: {
      type: 'text',
      placeholder: slot.sourceToken || slot.concept,
      maxlength: 60,
    },
    on: {
      input: () => queueLabel(),
      // Blur and Enter both land here; the debounce is only for typing.
      change: () => flushLabel(),
    },
  });
  captionInput.value = slot.label ?? '';

  const captionRow = isNew ? el('span') : el('label', { class: 'picker__caption' },
    el('span', { class: 'small muted', text: t('ui.text_under') }),
    captionInput,
  );

  const search = el('input', {
    class: 'field',
    attrs: { type: 'search', 'aria-label': t('ui.search_symbol'),
      placeholder: isNew ? t('ui.search_word') : t('ui.search_other_word') },
    on: { input: () => onQuery(search.value) },
  });

  const memoryNote = isNew ? el('span') : el('p', {
    class: 'small faint',
    style: { marginTop: '14px', marginBottom: '0' },
    text: t('ui.choice_remembered', { word: slot.sourceToken }),
  });

  /*
   * The square, on screen only between choosing a file and keeping it. Built
   * empty and hidden rather than inserted into a dialog somebody is already
   * looking at, and everything else goes away while it is up: a live grid of
   * symbols under an open crop is a press that throws the crop away without
   * saying so.
   */
  let cropper: Cropper | null = null;
  /* What Enter means while a square is being chosen. Held here rather than only
   * on the button, because the dialog's own Enter handler is the thing that
   * would otherwise close over an unkept crop - see it below. */
  let keepSquare: (() => void) | null = null;
  const cropSlot = el('div', { class: 'picker__crop', attrs: { hidden: true } });
  const asideWhileCropping = [search, ownRow, captionRow, negateRow, status, grid, memoryNote];

  const dialog = openDialog({
    title: isNew ? t('ui.add_slot') : t('ui.symbol_for', { word: slot.sourceToken }),
    body: [
      search,
      ownRow,
      captionRow,
      negateRow,
      cropSlot,
      status,
      grid,
      memoryNote,
    ],
    footer: [
      el('button', { class: 'btn destructive', text: isNew ? t('ui.cancel') : t('ui.remove_slot'),
        attrs: { type: 'button' }, on: { click: () => finish(handlers.onRemove) } }),
      el('div', { class: 'spacer' }),
      /*
       * Fertig means the square while one is being chosen. It used to close
       * over an open crop and settle the field on whatever it had before —
       * defensible, in that nothing had been written and no way out of this
       * dialog had ever cost anything, and from where somebody is sitting it
       * was a picture chosen, a picture adjusted, and then nothing at all.
       * The ✕ and a press outside still cost nothing; those say "never mind".
       */
      el('button', { class: 'btn', text: t('ui.done'), attrs: { type: 'button' },
        on: { click: () => keepSquare ? keepSquare() : finish(handlers.onClose) } }),
    ],
    onClose: () => { if (settled) return; teardown(); handlers.onClose(); },
  });

  /*
   * Enter is Fertig. A <dialog> with no form in it has no default action, so
   * until now the key did nothing at all — and it is what a person reaches for
   * after typing a caption.
   *
   * Two things keep their own Enter. A focused button is the browser's to
   * activate, and the search field means "look for this now" rather than "I am
   * done" — closing the dialog there would throw away the reason it was open.
   */
  dialog.dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a')) return;

    event.preventDefault();
    // While a square is being chosen, Fertig is that square. Without this the
    // dialog's Enter settled the field on whatever it had before, which from
    // where somebody is sitting is the crop being thrown away by the key that
    // everywhere else in this dialog means "yes".
    if (keepSquare) { keepSquare(); return; }
    if (target === search) onQuery(search.value, true);
    else finish(handlers.onClose);
  });

  function teardown(): void {
    // Before anything else: a caption typed and then settled by pressing a
    // symbol must reach the slot ahead of the pick, not after it.
    flushLabel();
    // Whatever a crop was loaded from, let go of — including on the ways out
    // that keep the square, which have already cut it by the time this runs.
    cropper?.close();
    cropper = null;
    keepSquare = null;
    window.clearTimeout(labelTimer);
    window.clearTimeout(searchTimer);
    for (const view of views) view.destroy();
    views = [];
  }

  /**
   * Going into the square, and coming back out of it.
   *
   * Nothing is written by either. The database is not touched until the press
   * that keeps a square, so cancelling costs exactly what closing this dialog
   * has always cost — which is nothing.
   */
  function beginCrop(cutter: Cropper, name: string): void {
    cropper = cutter;

    keepSquare = () => {
      void cutter.cut().then(
        (square) => finish(() => handlers.onOwnImage(square, cropName(name, square.type))),
        () => {
          endCrop();
          status.textContent = t('ui.crop_failed');
        });
    };

    /*
     * No buttons of its own, and it had two. Both went the same way and for the
     * same reason: this dialog already has a footer, the footer already says
     * what it does, and a control repeating that an inch higher is a question
     * about which of them is the real one rather than a choice. Fertig keeps
     * the square — so does Enter — and the ✕ drops it, which is what all three
     * mean everywhere else here. The sentence below says the first half; what
     * a ✕ means has never needed saying.
     */
    fill(cropSlot,
      cutter.box,
      cutter.zoom,
      el('p', { class: 'small muted', style: { margin: '8px 0 0' },
        text: t('ui.crop_hint') }),
    );
    cropSlot.hidden = false;
    for (const node of asideWhileCropping) node.hidden = true;
    cutter.box.focus();
  }

  /** Back to the suggestions, keeping nothing. The one caller left is a cut
   *  that failed: every deliberate way out of a crop is the dialog's own. */
  function endCrop(): void {
    cropper?.close();
    cropper = null;
    keepSquare = null;
    cropSlot.hidden = true;
    fill(cropSlot);
    for (const node of asideWhileCropping) node.hidden = false;
    // The press that would have moved focus has just gone from under it. Not
    // back to what opened the crop — that control is a <label> around a hidden
    // input and takes no focus — but to the search field, which is where
    // somebody who has just dropped a picture is going next.
    search.focus();
  }

  /** Closes the dialog and then runs the outcome the pressed button stands for. */
  function finish(outcome: () => void): void {
    settled = true;
    teardown();
    dialog.close();
    outcome();
  }

  /*
   * Typing writes through, so the caption under the symbol in the row behind the
   * dialog updates as it is typed. Debounced because every write is a database
   * write and a repaint of every row.
   */
  function queueLabel(): void {
    pending = captionInput.value;
    window.clearTimeout(labelTimer);
    labelTimer = window.setTimeout(flushLabel, 260);
  }

  function flushLabel(): void {
    window.clearTimeout(labelTimer);
    if (pending === null) return;
    const value = pending;
    pending = null;
    handlers.onLabel(value);
  }

  function paint(candidates: Candidate[], message: string): void {
    status.textContent = message;
    for (const view of views) view.destroy();
    views = [];

    /*
     * METACOM ships parallel rendering folders holding identical file names,
     * so a search can answer several tiles that all say "ja" and differ only
     * in picture. When a label repeats, the tile also names the folder its
     * rendering came from. Display only - the candidate that is stored and
     * chosen is untouched.
     */
    const twins = new Map<string, boolean>();
    for (const candidate of candidates) twins.set(candidate.label, twins.has(candidate.label));

    fill(grid, ...candidates.map((candidate) => {
      const view = symbolView({ provider, id: candidate.id, alt: candidate.label });
      views.push(view);
      const folder = provider === 'metacom' && twins.get(candidate.label)
        ? folderOf(candidate.id) : '';
      const caption = folder ? `${candidate.label} · ${folder}` : candidate.label;
      return el('button', {
        class: `picker__item${candidate.id === chosen ? ' picker__item--active' : ''}`,
        attrs: { type: 'button', title: caption },
        on: { click: () => finish(() => handlers.onChoose(candidate)) },
      },
        el('span', { class: 'slot__img' }, view.node),
        el('span', { text: caption }),
      );
    }));
  }

  /** The folder a candidate's picture sits in, said the way a human would -
   *  "PNG ohne Rahmen" - or '' for a file straight under the collection root.
   *  Ids only start with the root when the collection came in as a file list
   *  or zip, so the root is compared, never assumed. */
  function folderOf(id: string): string {
    const segments = id.split('/');
    const inside = segments[0] === metacom.rootName ? segments.slice(1) : segments;
    return inside.length > 1 ? inside[inside.length - 2].replace(/_/g, ' ') : '';
  }

  function idleMessage(): string {
    if (isNew) return t('ui.search_to_fill');
    return suggested.length > 0
      ? t('ui.suggestions_for', { word: slot.concept })
      : t('ui.no_suggestions_for', { word: slot.concept });
  }

  function onQuery(raw: string, now = false): void {
    const term = raw.trim();
    window.clearTimeout(searchTimer);
    const mine = ++searchToken;

    if (!term) {
      paint(suggested, idleMessage());
      return;
    }

    status.textContent = t('ui.searching');
    /*
     * Debounced manual search — the escape hatch for anything the pipeline
     * missed. Enter asks for it now: sitting out a debounce you have finished
     * typing through reads as the key having done nothing.
     */
    searchTimer = window.setTimeout(async () => {
      const found = await getProvider(provider).search(term).catch(() => []);
      if (mine !== searchToken) return;
      paint(found, found.length === 0
        ? t('ui.no_hits_for', { term })
        : found.length === 1
          ? t('ui.hits_for_one', { term })
          : t('ui.hits_for', { n: found.length, term }));
    }, now ? 0 : 260);
  }

  paint(suggested, idleMessage());

  /*
   * Slots store only a handful of candidates to keep collections and exports
   * small. Re-query on open for the full list — cached, so this is instant the
   * second time. Stored candidates stay first: they include any manual pick.
   */
  if (slot.concept) {
    getProvider(provider).search(slot.concept).then((found) => {
      if (found.length === 0 || searchToken !== 0 || search.value.trim()) return;
      const seen = new Set(stored.map((c) => c.id));
      suggested = [...stored, ...found.filter((c) => !seen.has(c.id))];
      paint(suggested, idleMessage());
    }).catch(() => undefined);
  }
}
