import { openSheet } from '@lautstark/design/svelte/sheet';
import { CLOSE } from './dialog.ts';
import SettingsBody from './SettingsBody.svelte';
import { t } from '../i18n/index.ts';

/**
 * Every section is a folded panel whose heading carries its state, so the whole
 * of what bildhaft is set to reads at a glance and opening one is a decision.
 *
 * The two symbol sources are panels in their own right. They were already
 * status-bearing cards inside a "Symbole" tab, which made the tab a layer of
 * furniture over a list that said the same thing one level down.
 *
 * What opened this used to be handed eleven callbacks and a Sicherung; the body
 * reaches the same modules the rest of the app does, so all that is left here
 * is the frame and its one word.
 */
export function openSettings(): void {
  const sheet: { close(): void } = openSheet({
    title: t('ui.settings'),
    closeLabel: CLOSE,
    /* A column of panels, so 900px rather than 600. Three products showed this
       same column at 600 and wochenwerk at 900, and wochenwerk was the only one
       with a reason written down: 900px is where a line of German stops being
       comfortable, and a column of panels is not a grid of cards. See
       design/docs/conventions.md 4.14. The print dialog keeps `wide` — it is
       the grid of cards that reason excludes. */
    panels: true,
    state: { close: () => sheet.close() },
    body: SettingsBody,
  });
}
