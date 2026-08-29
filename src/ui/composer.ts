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
import { LANG, t } from '../i18n/index.ts';

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
    /* `lang` follows the page: it is what the browser spellchecks against, and
       main.ts already sets documentElement.lang, which a hard-coded 'de' here
       was quietly overriding for an English reader. */
    attrs: { rows: 1, placeholder: t('ui.composer_placeholder'),
      'aria-label': t('ui.composer_label'), spellcheck: 'true', lang: LANG },
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
    attrs: { type: 'button', 'aria-label': t('ui.translate'), title: t('ui.translate') },
    on: { click: handlers.onSubmit },
  }, goIcon);

  const providerWhat = el('span');
  const providerName = el('b', { style: { fontWeight: '600' } });
  /* A statement, not a control. It carried an „Aendern" button until
     2026-08-29 that led to this Sammlung's sheet or to the settings card
     depending on where the next sentence would land, and the caption beside it
     was what made that honest - an argument this file used to have to make.
     Each answer has one door now: a Sammlung's is its ⋯, the default is the
     settings card. */
  const providerLine = el('span', { class: 'composer__provider' },
    providerWhat, providerName);
  const reuseRow = el('div', { class: 'composer__reuse' },
    el('span', { text: t('ui.already_translated'), style: { flex: '1' } }),
    el('button', { class: 'btn sm', text: t('ui.reuse'),
      attrs: { type: 'button' }, on: { click: handlers.onReuse } }),
  );

  const node = el('div', { class: 'composer' },
    el('div', { class: 'composer__box' }, input, go),
    el('div', { class: 'composer__meta' },
      el('span', { html: t('ui.composer_hint') }),
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
   * two it read is a line that is right by luck.
   *
   * That second fact used to do double duty, as the caption that made one
   * „Ändern" button leading to two different places honest. The button is gone
   * and the fact stays, because it was always the more useful half: it answers
   * "which source is this" without anybody pressing anything.
   */
  function drawProvider(state: ComposerState): void {
    const own = state.inCollection && state.providerOwned;
    providerWhat.textContent = own ? t('ui.symbols_of_collection') : t('ui.symbols_default');
    providerName.textContent =
      `${state.providerName}${state.providerReady ? '' : ` (${t('ui.not_ready')})`}`;
  }

  return { node, render };
}
