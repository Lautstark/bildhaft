/**
 * What one Sammlung is drawn in, in the one place it can be said without
 * ambiguity: a sheet opened from the ⋯ beside its name.
 *
 * §3.6 is why it is there rather than in Einstellungen: the ⋯ holds what a
 * Sammlung *is* as well as what can be done to it, because both are answered by
 * *which* Sammlung the menu is beside. §3.10 is the test — a control whose
 * answer changes with the selection is not a setting of the app — and this one
 * would have shown a different answer for every Sammlung, which is exactly the
 * arrangement that section exists to prevent.
 *
 * ## Why this is a sheet and not a panel in the settings dialog
 *
 * The settings card is a setup surface: a licence notice, a folder picker, a
 * ZIP reader, a chooser for METACOM's parallel renderings, „Ordner vergessen".
 * None of that is a question about one Sammlung. What is left when they are
 * taken out is a list of two names, which is what this sheet is: the lead says
 * whose source this is, the list is open, and the cost sits under it.
 *
 * ## Live apply, and no confirmation
 *
 * Picking writes and closes nothing. There is no Save and no Cancel, because a
 * symbol source destroys nothing: every slot keeps a concept key and a choice
 * *per provider*, and every override is keyed `${provider}:${token}`, so
 * switching redraws the page and switching back finds every manual correction
 * still there. That is the same property that let conventions.md §3.10 exempt
 * this setting in the first place. A confirmation would be asking permission
 * for something free while saying nothing about what it costs.
 *
 * What it does cost is a redraw of every row, and that is said — before the
 * press, in the line under the list, and again in the page's own toast
 * afterwards. bildhaft has always said this out loud when adopting a folder;
 * this is the same property in a second place rather than a new one.
 */

import type { Collection, ProviderId } from '../core/types.ts';
import { el } from './dom.ts';
import { openDialog } from './dialog.ts';
import { sourcePicker } from './symbolSources.ts';

export interface CollectionSourceOptions {
  collection: Collection;
  /** How many rows a change redraws. Stated before the press. */
  rowCount: number;
  /** The source a Sammlung with no answer of its own follows. */
  fallback: ProviderId;
  /** null means "follow the default" — a real answer, not a cleared field. */
  onPick: (choice: ProviderId | null) => void | Promise<void>;
}

export function openCollectionSource(options: CollectionSourceOptions): void {
  const { collection, rowCount, fallback } = options;

  /* What is chosen, held here rather than re-read from the store: the pick is
     written through and the page behind reloads, but this sheet must mark the
     new answer on the press rather than a moment later, or the row a person
     just pressed reads as having done nothing. */
  let chosen: ProviderId | null = collection.provider ?? null;

  const picker = sourcePicker({
    current: () => chosen,
    fallback: () => fallback,
    pick: (choice) => {
      if (choice === chosen) return;
      chosen = choice;
      picker.draw();
      cost.textContent = costSays();
      void options.onPick(choice);
    },
  });

  /**
   * What a different source costs, in sentences, before the press.
   *
   * The count is this Sammlung's, not the library's: the sheet is about one of
   * them. An empty Sammlung is told that it is empty rather than told about
   * zero rows, because "0 Zeilen werden neu gezeichnet" is a sentence about
   * nothing pretending to be a warning.
   */
  function costSays(): string {
    const following = chosen === null
      ? ' Sie folgt der Standardquelle und wandert mit, wenn du die änderst.'
      : '';
    if (rowCount === 0) return `Diese Sammlung ist noch leer.${following}`;
    return `${rowCount} Zeile${rowCount === 1 ? '' : 'n'} ${rowCount === 1 ? 'wird' : 'werden'} `
      + `dabei neu gezeichnet. Deine Sätze und deine von Hand gewählten Symbole bleiben erhalten — `
      + `bildhaft speichert Verweise, keine Bilder.${following}`;
  }

  const cost = el('p', { class: 'small faint', style: { margin: '14px 0 0' }, text: costSays() });

  const dialog = openDialog({
    title: 'Symbolquelle',
    body: [
      el('p', { class: 'small muted', style: { margin: '0 0 12px' },
        text: `Womit „${collection.name}“ gezeichnet wird.` }),
      picker.node,
      cost,
    ],
    footer: [
      el('div', { class: 'spacer' }),
      // One way out, and it says what it does. There is nothing to cancel:
      // every press has already been written.
      el('button', { class: 'btn', text: 'Fertig', attrs: { type: 'button' },
        on: { click: () => dialog.close() } }),
    ],
    onClose: () => undefined,
  });
}
