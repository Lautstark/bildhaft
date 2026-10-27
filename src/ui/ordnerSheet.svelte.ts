/**
 * „In Ordner legen …": which Ordner one material lies in, from the ⋯ beside
 * its name. The list is the Ordner of its own template — an Ordner sits inside
 * its template's group in the sidebar, so a Tafel goes with Tafeln — with
 * „Kein Ordner" first, and „+ Neuer Ordner" under it opens the line every
 * material adds with.
 *
 * Live, like the source sheet beside it: a press is written through and the
 * sidebar moves at once, and the one way out is „Fertig". Nothing is lost by a
 * press — the material only moves — so there is nothing to confirm.
 */

import type { Collection } from '../core/types.ts';
import { sameOrdner } from '../core/ordner.ts';
import { openSheet } from '@lautstark/design/svelte/sheet';
import { CLOSE } from './dialog.ts';
import OrdnerBody from './OrdnerBody.svelte';
import CollectionSourceFoot from './CollectionSourceFoot.svelte';
import { t } from '../i18n/index.ts';

export interface OrdnerSheetOptions {
  collection: Collection;
  /** The Ordner of its template, each with how many materials lie in it. */
  ordner: { name: string; count: number }[];
  onPick: (name: string | null) => void | Promise<void>;
}

export class Placing {
  chosen = $state.raw<string | null>(null);
  /** Ordner made in this sheet, until the list it was opened with has them. */
  made = $state.raw<string[]>([]);
  adding = $state(false);
  close: () => void = () => undefined;

  constructor(readonly options: OrdnerSheetOptions) {
    this.chosen = options.collection.ordner ?? null;
  }

  get rows(): { name: string; count: number }[] {
    const fresh = this.made.filter((name) => !this.options.ordner.some((o) => sameOrdner(o.name, name)));
    return [...this.options.ordner, ...fresh.map((name) => ({ name, count: 0 }))];
  }

  isChosen(name: string | null): boolean {
    return name === null ? this.chosen === null : sameOrdner(name, this.chosen ?? undefined);
  }

  pick(name: string | null): void {
    if (this.isChosen(name)) return;
    this.chosen = name;
    void this.options.onPick(name);
  }

  /** A new Ordner, and this material into it. */
  make(raw: string): void {
    const name = raw.trim();
    if (!name) return;
    const held = this.rows.find((o) => sameOrdner(o.name, name));
    if (!held) this.made = [...this.made, name];
    this.adding = false;
    this.pick(held?.name ?? name);
  }
}

export function openOrdnerSheet(options: OrdnerSheetOptions): void {
  const state = new Placing(options);
  const sheet = openSheet({
    title: t('ui.ordner_sheet_title'),
    closeLabel: CLOSE,
    state,
    body: OrdnerBody,
    foot: CollectionSourceFoot,
  });
  state.close = sheet.close;
}
