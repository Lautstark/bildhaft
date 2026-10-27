/**
 * „Kopieren …": a copy of the open material beside it, under a name typed
 * here, with everything or with only its look. Her pick „K2", 2026-10-27:
 * „Nur das Aussehen" is the next Tafel of a set — the same grid, colours,
 * groups and print, every field free.
 *
 * Unlike the Ordner's sheet this one makes something, so it waits for
 * „Kopieren" and can be left with „Abbrechen".
 */

import type { Collection } from '../core/types.ts';
import { openSheet } from '@lautstark/design/svelte/sheet';
import { CLOSE } from './dialog.ts';
import CopyBody from './CopyBody.svelte';
import CopyFoot from './CopyFoot.svelte';
import { t } from '../i18n/index.ts';

export interface CopySheetOptions {
  collection: Collection;
  /** The name it starts with, „Frühstück (Kopie)". */
  name: string;
  onCopy: (name: string, withContent: boolean) => void | Promise<void>;
}

export class Copying {
  name = $state('');
  withContent = $state(true);
  busy = $state(false);
  close: () => void = () => undefined;

  constructor(readonly options: CopySheetOptions) {
    this.name = options.name;
  }

  async copy(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.options.onCopy(this.name.trim() || this.options.name, this.withContent);
      this.close();
    } finally {
      this.busy = false;
    }
  }
}

export function openCopySheet(options: CopySheetOptions): void {
  const state = new Copying(options);
  const sheet = openSheet({
    title: t('ui.copy_sheet_title'),
    closeLabel: CLOSE,
    state,
    body: CopyBody,
    foot: CopyFoot,
  });
  state.close = sheet.close;
}
