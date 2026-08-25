/**
 * Typing a sentence, and which symbol source the rows under it are drawn from.
 *
 * The source is not chosen here. What sits under the box is the sentence that
 * says which one is in force and the way through to changing it — the same
 * shape mitreden's composer took when its voice moved onto the Sammlung.
 *
 * *Which* source that is stopped being one answer when it moved onto the
 * Sammlung. In a Sammlung it is that Sammlung's, when it has one; otherwise it
 * is the default the Sammlung follows. The line says which of the two it read,
 * because both are true statements about a symbol source and only one of them
 * is true here — see drawProvider.
 */

import type { Sentence } from '../core/types.ts';
import { el } from './dom.ts';
import { icons } from './logo.ts';

/** Past this the box scrolls instead of growing. */
const MAX_INPUT_HEIGHT = 190;

export interface ComposerHandlers {
  onChange: (value: string) => void;
  onSubmit: () => void;
  onReuse: () => void;
  /**
   * Take me to where this is decided. Which place that is depends on whose
   * answer the line just named, so the caller routes it — see drawProvider for
   * why the button says which door before it is pressed.
   */
  onChangeProvider: () => void;
}

export interface ComposerState {
  value: string;
  busy: boolean;
  /** A previous translation of the same line, offered for reuse. */
  reuse: Sentence | null;
  providerName: string;
  providerReady: boolean;
  /** Whether a Sammlung is open at all — see drawProvider. */
  inCollection: boolean;
  /** Whether that Sammlung answered for itself, or is following the default. */
  providerOwned: boolean;
}

export function composer(handlers: ComposerHandlers): {
  node: HTMLElement;
  render(state: ComposerState): void;
} {
  const input = el('textarea', {
    class: 'composer__input',
    attrs: { rows: 1, placeholder: 'Satz eingeben, z. B. „Ich möchte einen Apfel essen“',
      'aria-label': 'Satz eingeben', spellcheck: 'true', lang: 'de' },
    on: {
      input: () => { handlers.onChange(input.value); grow(); },
      keydown: (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          handlers.onSubmit();
        }
      },
    },
  });

  const goIcon = el('span', { class: 'composer__go-icon' }, icons.arrow());
  const go = el('button', {
    class: 'btn primary composer__go',
    attrs: { type: 'button', 'aria-label': 'Übersetzen', title: 'Übersetzen' },
    on: { click: handlers.onSubmit },
  }, goIcon);

  const providerWhat = el('span');
  const providerName = el('b', { style: { fontWeight: '600' } });
  const providerChange = el('button', {
    class: 'btn quiet sm',
    text: 'Ändern',
    attrs: { type: 'button' },
    on: { click: handlers.onChangeProvider },
  });
  const providerLine = el('span', { class: 'composer__provider' },
    providerWhat, providerName, providerChange);
  const reuseRow = el('div', { class: 'composer__reuse' },
    el('span', { text: 'Diesen Satz hast du schon übersetzt.', style: { flex: '1' } }),
    el('button', { class: 'btn sm', text: 'Übernehmen',
      attrs: { type: 'button' }, on: { click: handlers.onReuse } }),
  );

  const node = el('div', { class: 'composer' },
    el('div', { class: 'composer__box' }, input, go),
    el('div', { class: 'composer__meta' },
      el('span', { html: '<kbd>Enter</kbd> übersetzt · <kbd>Shift</kbd>+<kbd>Enter</kbd> neue Zeile' }),
      providerLine,
    ),
  );

  /*
   * Grow with the content instead of scrolling inside a fixed box.
   *
   * Collapsing to 0 first makes the measurement deterministic — reading back
   * 'auto' can report the previous used height within the same frame. The
   * viewport guard matters because a page mounted in a background tab measures
   * against a zero-height viewport and would otherwise lock the box open at its
   * maximum height for the rest of the session.
   */
  function grow(): void {
    if (window.innerHeight === 0 || document.visibilityState === 'hidden') return;
    input.style.height = '0px';
    input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }

  document.addEventListener('visibilitychange', grow);
  window.addEventListener('resize', grow);
  document.fonts?.ready.then(grow).catch(() => undefined);

  // Focused on load: typing is the entire interaction. Skipped on touch devices,
  // where it would immediately open the on-screen keyboard and shrink the viewport.
  if (!window.matchMedia('(hover: none)').matches) input.focus();

  function render(state: ComposerState): void {
    if (input.value !== state.value) {
      input.value = state.value;
      grow();
    }

    go.toggleAttribute('disabled', state.busy || !state.value.trim());
    goIcon.replaceChildren(state.busy ? el('span', { class: 'spinner' }) : icons.arrow());

    drawProvider(state);

    if (state.reuse) node.appendChild(reuseRow);
    else reuseRow.remove();
  }

  /**
   * Which source the rows are drawn from, in the two facts that decide it: its
   * name, and *whose* answer that is.
   *
   * The second fact is what the line was missing. It was right before because
   * there was one answer; there are two now — this Sammlung's own, or the
   * default it follows — and a line naming a source without saying which of the
   * two it read is a line that is right by luck. It is also what makes one
   * „Ändern" leading to two different places honest: the word beside it says
   * which door, before the press rather than after it.
   *
   * bildhaft opens exactly one Sammlung at a time and boot makes one where the
   * library is empty, so the third arm — no Sammlung at all, where the default
   * is the only answer there could be and the settings card is the only place
   * to change it — is the type's case rather than one somebody reaches. It is
   * written anyway: it costs a branch, and the alternative is a button that
   * would silently lead nowhere if that ever stopped being true.
   */
  function drawProvider(state: ComposerState): void {
    const own = state.inCollection && state.providerOwned;
    providerWhat.textContent = own ? 'Symbole dieser Sammlung: ' : 'Symbole (Standard): ';
    providerName.textContent =
      `${state.providerName}${state.providerReady ? '' : ' (nicht bereit)'}`;
    /* The button says nothing but „Ändern" and has room for nothing more, so
       what it leads to is in the name a reader hears rather than only in the
       caption a reader sees. */
    const what = state.inCollection
      ? 'Symbolquelle dieser Sammlung ändern'
      : 'Standard-Symbolquelle ändern';
    providerChange.title = what;
    providerChange.setAttribute('aria-label', what);
  }

  return { node, render };
}
