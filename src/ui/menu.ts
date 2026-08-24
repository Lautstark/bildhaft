/**
 * The `⋯` trigger this app draws, wired to the shared menu.
 *
 * What the popover *does* — where focus goes on open and where it returns to,
 * the arrows and Home/End, what a second press on the trigger means, what
 * closes it — is @lautstark/design/menu now, beside the CSS in components.css
 * that has drawn `.menu` since v1.7.0. This file is what is left: the button,
 * which the shared module deliberately does not own, because one product draws
 * a `⋯` here and another a labelled dropdown and the markup belongs with the
 * page that reads.
 *
 * The item shape changed with it. This app passed an array of objects; the
 * shared one hands a `build` function an `add(label, run, opts)`, which is the
 * form the other two already used and the form whose named options stopped the
 * third argument meaning "destructive" in one product and "in force" in
 * another. `MenuItem` is gone rather than mapped, so there is one vocabulary.
 */

import { menuOn, type AddItem } from '@lautstark/design/menu';
import { el } from './dom.ts';
import { icons } from './logo.ts';

export type { AddItem };

/** A `⋯` that opens `build`'s items. Returns the anchor, ready to be placed. */
export function actionMenu(label: string, build: (add: AddItem) => void): HTMLElement {
  const trigger = el('button', {
    class: 'btn quiet icon',
    attrs: { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': label, title: label },
  }, icons.dots());
  // Assigned after the element exists, so the handler can name it. menuOn
  // toggles on aria-expanded, so a second press is a dismissal without this
  // file tracking whether anything is open.
  trigger.onclick = () => menuOn(trigger, build);
  return el('div', { class: 'menu-anchor' }, trigger);
}
