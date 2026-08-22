import type { Candidate, ProviderId, Slot } from '../core/types.ts';
import { getProvider } from '@lautstark/bildquelle';
import { el, fill } from './dom.ts';
import { openDialog } from './dialog.ts';
import { symbolView, type SymbolView } from './symbols.ts';

export interface PickerHandlers {
  onChoose: (candidate: Candidate) => void;
  /** Removes the whole slot, not just its symbol. */
  onRemove: () => void;
  onClose: () => void;
}

export function openSlotPicker(slot: Slot, provider: ProviderId, handlers: PickerHandlers): void {
  const stored = slot.candidates[provider] ?? [];
  const chosen = slot.choice[provider] ?? null;
  const isNew = !slot.concept;

  let suggested: Candidate[] = stored;
  /*
   * True once a button has decided the outcome. The dialog reports every close,
   * including the ones these buttons cause — without this guard a pick fired the
   * dismissal handler first, which discarded the very slot being filled.
   */
  let settled = false;
  let views: SymbolView[] = [];
  let searchTimer: number | undefined;
  let searchToken = 0;

  const status = el('p', { class: 'small muted', style: { margin: '12px 0 0' } });
  const grid = el('div', { class: 'picker__grid' });

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
      status,
      grid,
      isNew ? el('span') : el('p', {
        class: 'small faint',
        style: { marginTop: '14px', marginBottom: '0' },
        text: `Deine Auswahl wird für „${slot.sourceToken}“ gemerkt und beim nächsten Mal automatisch verwendet.`,
      }),
    ],
    footer: [
      el('button', { class: 'btn btn--danger', text: isNew ? 'Abbrechen' : 'Feld entfernen',
        attrs: { type: 'button' }, on: { click: () => finish(handlers.onRemove) } }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn', text: 'Fertig', attrs: { type: 'button' },
        on: { click: () => finish(handlers.onClose) } }),
    ],
    onClose: () => { if (settled) return; teardown(); handlers.onClose(); },
  });

  function teardown(): void {
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

  function paint(candidates: Candidate[], message: string): void {
    status.textContent = message;
    for (const view of views) view.destroy();
    views = [];

    fill(grid, ...candidates.map((candidate) => {
      const view = symbolView({ provider, id: candidate.id, alt: candidate.label });
      views.push(view);
      return el('button', {
        class: `picker__item${candidate.id === chosen ? ' picker__item--active' : ''}`,
        attrs: { type: 'button', title: candidate.label },
        on: { click: () => finish(() => handlers.onChoose(candidate)) },
      },
        el('span', { class: 'slot__img' }, view.node),
        el('span', { text: candidate.label }),
      );
    }));
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
