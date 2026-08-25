import type { Candidate, ProviderId, Slot } from '../core/types.ts';
import { getProvider, metacom } from '@lautstark/bildquelle';
import { el, fill } from './dom.ts';
import { openDialog } from './dialog.ts';
import { symbolView, type SymbolView } from './symbols.ts';

export interface PickerHandlers {
  onChoose: (candidate: Candidate) => void;
  /** A picture of the user's own, taking the place of any symbol. */
  onOwnImage: (file: File) => void;
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
        if (file) finish(() => handlers.onOwnImage(file));
      },
    },
  });

  const ownRow = el('div', { class: 'picker__own' },
    el('label', { class: 'btn sm', text: 'Eigenes Bild wählen', style: { cursor: 'pointer' } },
      upload),
    slot.ownImage
      ? el('button', { class: 'btn sm destructive', text: 'Eigenes Bild entfernen',
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
    el('label', { class: 'opt__check' }, negateBox, 'Symbol durchstreichen'),
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
    el('span', { class: 'small muted', text: 'Text unter dem Symbol' }),
    captionInput,
  );

  const search = el('input', {
    class: 'field',
    attrs: { type: 'search', 'aria-label': 'Symbol suchen',
      placeholder: isNew ? 'Wort suchen …' : 'Anderes Wort suchen …' },
    on: { input: () => onQuery(search.value) },
  });

  const dialog = openDialog({
    title: isNew ? 'Feld hinzufügen' : `Symbol für „${slot.sourceToken}“`,
    body: [
      search,
      ownRow,
      captionRow,
      negateRow,
      status,
      grid,
      isNew ? el('span') : el('p', {
        class: 'small faint',
        style: { marginTop: '14px', marginBottom: '0' },
        text: `Deine Auswahl wird für „${slot.sourceToken}“ gemerkt und beim nächsten Mal automatisch verwendet.`,
      }),
    ],
    footer: [
      el('button', { class: 'btn destructive', text: isNew ? 'Abbrechen' : 'Feld entfernen',
        attrs: { type: 'button' }, on: { click: () => finish(handlers.onRemove) } }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn', text: 'Fertig', attrs: { type: 'button' },
        on: { click: () => finish(handlers.onClose) } }),
    ],
    onClose: () => { if (settled) return; teardown(); handlers.onClose(); },
  });

  function teardown(): void {
    // Before anything else: a caption typed and then settled by pressing a
    // symbol must reach the slot ahead of the pick, not after it.
    flushLabel();
    window.clearTimeout(labelTimer);
    window.clearTimeout(searchTimer);
    for (const view of views) view.destroy();
    views = [];
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
    if (isNew) return 'Suche nach einem Wort, um das Feld zu füllen.';
    return suggested.length > 0
      ? `Vorschläge für „${slot.concept}“`
      : `Für „${slot.concept}“ wurde nichts gefunden. Suche oben nach einem anderen Wort.`;
  }

  function onQuery(raw: string): void {
    const term = raw.trim();
    window.clearTimeout(searchTimer);
    const mine = ++searchToken;

    if (!term) {
      paint(suggested, idleMessage());
      return;
    }

    status.textContent = 'Suche läuft …';
    // Debounced manual search — the escape hatch for anything the pipeline missed.
    searchTimer = window.setTimeout(async () => {
      const found = await getProvider(provider).search(term).catch(() => []);
      if (mine !== searchToken) return;
      paint(found, found.length > 0
        ? `${found.length} Treffer für „${term}“`
        : `Keine Treffer für „${term}“`);
    }, 260);
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
