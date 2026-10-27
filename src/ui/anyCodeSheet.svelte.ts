/**
 * The small code sheet: „Anybook-Stift" alone, for a code that has no Symbol
 * dialog to sit in — the title's, a Rezept's Schritt's, a Lied's line's. The
 * same section the Symbol dialog carries, so a code is changed one way
 * wherever it is.
 */
import { openSheet } from '@lautstark/design/svelte/sheet';
import { CLOSE } from './dialog.ts';
import type { CodeHere } from './anybookEdit.ts';
import AnyCodeBody from './AnyCodeBody.svelte';
import AnyCodeFoot from './AnyCodeFoot.svelte';

export class CodeSheet {
  close: () => void = () => undefined;
  constructor(readonly code: CodeHere) {}
}

export function openCodeSheet(code: CodeHere, title: string): void {
  const state = new CodeSheet(code);
  const sheet = openSheet({ title, closeLabel: CLOSE, state, body: AnyCodeBody, foot: AnyCodeFoot });
  state.close = sheet.close;
}
