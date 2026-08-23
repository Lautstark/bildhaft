import { el } from './dom.ts';
import { icons } from './logo.ts';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /**
   * Left off, the item is a command and keeps role="menuitem". Set either way,
   * the menu is a set of alternatives and the item becomes menuitemradio with
   * aria-checked. Nothing in bildhaft opens that second kind of menu yet —
   * this is here so the three products describe an item with the same word,
   * which is what the sibling `ItemOpts` in mitreden and vorlaut now use.
   */
  checked?: boolean;
}

/** The items worth landing on. A disabled one is skipped, not stepped through. */
const rows = (menu: Element): HTMLElement[] =>
  [...menu.querySelectorAll<HTMLElement>('button:not(:disabled)')];

/** Small actions popover. Anchored to its trigger, closes on outside click or Escape. */
export function actionMenu(label: string, items: () => MenuItem[]): HTMLElement {
  let pop: HTMLElement | null = null;

  const close = () => {
    // Focus goes back to the trigger only when it was inside the menu to begin
    // with. Escape and a chosen item both arrive here that way and both want
    // it back; an outside click arrives here too, and pulling focus back would
    // yank it out of whatever that click just gave it to.
    const inside = pop?.contains(document.activeElement) ?? false;
    pop?.remove();
    pop = null;
    trigger.setAttribute('aria-expanded', 'false');
    if (inside) trigger.focus();
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('keydown', onKey);
  };

  const onDown = (event: MouseEvent) => {
    if (!root.contains(event.target as Node)) close();
  };

  /* Escape closes; the arrows and Home/End walk the list. The walk is guarded
     on focus actually being in the menu, because this listener is on the
     document — an arrow press meant for the page behind it must not be stolen
     just because a menu happens to be open somewhere. */
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { close(); return; }
    if (!pop?.contains(document.activeElement)) return;
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const list = rows(pop);
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (at < 0 || !list.length) return;
    event.preventDefault();
    const to = event.key === 'Home' ? 0
      : event.key === 'End' ? list.length - 1
        : event.key === 'ArrowDown'
          ? (at + 1) % list.length
          : (at - 1 + list.length) % list.length;
    list[to]!.focus();
  };

  const open = () => {
    pop = el('div', { class: 'menu', attrs: { role: 'menu' } },
      ...items().map((item) => el('button', {
        class: item.danger ? 'danger' : undefined,
        text: item.label,
        attrs: {
          type: 'button',
          role: item.checked === undefined ? 'menuitem' : 'menuitemradio',
          ...(item.checked === undefined ? {} : { 'aria-checked': String(item.checked) }),
          disabled: item.disabled ?? false,
        },
        on: { click: () => { close(); item.onSelect(); } },
      })),
    );
    root.appendChild(pop);
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // Focus goes in, or the menu is only open in the drawing: a reader left on
    // the trigger is told the list expanded and then has nothing to read, and
    // a keyboard has no way into it at all.
    rows(pop)[0]?.focus();
  };

  const trigger = el('button', {
    class: 'btn quiet icon',
    attrs: { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': label, title: label },
    on: { click: () => (pop ? close() : open()) },
  }, icons.dots());

  const root = el('div', { class: 'menu-anchor' }, trigger);
  return root;
}
