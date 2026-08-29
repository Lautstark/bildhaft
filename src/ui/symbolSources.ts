/**
 * What a symbol source *is*, said once for everywhere that asks.
 *
 * Two surfaces ask now — the settings card, which sets the default, and a
 * Sammlung's own sheet, which sets that Sammlung's — and they are different
 * questions about the same two sources. mitreden met this and answered it with
 * one shared list component (`src/ui/voicepicker.ts`), because its two surfaces
 * are both a list of the same catalogue and a second copy would have drifted.
 *
 * bildhaft's two are not the same shape and sharing the whole list would be a
 * fiction: the settings card is a *setup* surface — the licence notice, the
 * folder picker, the ZIP reader, the parallel-rendering chooser, „Ordner
 * vergessen" — and the choosing part of it is one button per panel. A Sammlung's
 * sheet has nothing to set up; it picks between what is already there.
 *
 * So what is shared is the part that would actually drift, which is the facts:
 * how many symbols METACOM has, which folder they came from, and the sentence
 * for a source that cannot answer. Those were written out in settingsDialog.ts
 * and would have been written out again in the sheet, and a folder count that
 * two screens disagree about is worse than one nobody states. Each surface
 * keeps its own frame and its own word for the role a source plays there.
 */

import type { ProviderId } from '../core/types.ts';
import {
  getProvider, metacom, needsAttention, PROVIDER_IDS, type ProviderStatus,
} from '@lautstark/bildquelle';
import { el, fill } from './dom.ts';
import { t } from '../i18n/index.ts';

/**
 * What a source's state says, in the language the page is in.
 *
 * bildquelle stopped shipping sentences in 2.0.0 and the reason was this
 * product: its `ProviderStatus` carried a German `message`, bildhaft printed it
 * at three sites, and a reader who had set bildhaft to English was told
 * „Ordner wird gelesen …" with nothing bildhaft could do about it. The words
 * belong to whoever knows the language, which is here.
 *
 * One function rather than a `t()` at each site, because the three sites are
 * three framings of one question and a fourth would otherwise invent a fourth
 * wording. The key is built from `code`, so a state added to the package
 * arrives as a missing key that tests/unit/text-keys.test.ts names — rather
 * than as an empty line nobody notices.
 *
 * `detail` is deliberately not concatenated here. It is whatever the platform
 * put in `Error.message`, in whatever language the platform chose, and a site
 * that wants to show it can put it beside this sentence where it reads as the
 * machine talking.
 */
export function sourceStatusLine(status: ProviderStatus): string {
  return status.kind === 'ready' ? '' : t(`ui.source_status_${status.code}`);
}

/** Every code a status can carry, taken from the package's own union rather
 *  than listed again — bildquelle exports `ProviderStatus` but not the three
 *  code types behind it. */
type SourceStatusCode = Extract<ProviderStatus, { code: string }>['code'];

/*
 * The codes as something that exists at run time, so tests/unit/text-keys.test.ts
 * can check that each has a sentence.
 *
 * A `Record` and not an array, because a record of the union is the one shape
 * the compiler makes exhaustive: leave a code out and this does not build, add
 * one that bildquelle has never heard of and it does not build either. The
 * scanner in that test cannot see through the template literal above, and a
 * code with no sentence would otherwise be a blank line on the settings card —
 * the same failure `ui.origin_*` has a list in core/types.ts to prevent, with
 * the same reason behind it: the values arrive from a package upgrade, not
 * from anything written here.
 */
const HAS_A_SENTENCE: Record<SourceStatusCode, null> = {
  'no-folder': null,
  'permission-needed': null,
  'reading-folder': null,
  'unpacking-zip': null,
  'indexing': null,
  'no-images': null,
  'read-failed': null,
  'network': null,
};

export const SOURCE_STATUS_CODES =
  Object.keys(HAS_A_SENTENCE) as readonly SourceStatusCode[];

export interface SourceFacts {
  id: ProviderId;
  /** The source's own name, from the package rather than from a table here. */
  label: string;
  /**
   * What decides between this source and the other one, in one line: its size,
   * and where it came from. For a source that cannot answer, why not.
   */
  facts: string;
  /** Whether it can draw a symbol right now. */
  ready: boolean;
  /**
   * Set when the state is somebody's to act on — a folder whose permission the
   * browser withdrew, or one that could not be read. `needsAttention` is
   * bildquelle's answer to which states those are, because it is the package
   * that knows what they mean; the words are this app's.
   */
  attention: boolean;
}

/**
 * ARASAAC's size is the same on every install and there is no folder to name,
 * so its line is the one fact that decides between it and METACOM. Kept short
 * because both surfaces put it on one line beside a role word.
 */
const ARASAAC_FACTS = t('ui.arasaac_count');

export function sourceFacts(id: ProviderId): SourceFacts {
  const label = getProvider(id).name;
  if (id === 'arasaac') {
    return { id, label, facts: ARASAAC_FACTS, ready: getProvider(id).isReady(), attention: false };
  }

  const status = metacom.status();
  const attention = needsAttention(status);
  return {
    id,
    label,
    // Narrowed on kind, not on isReady(): only the ready variant has no state
    // to report.
    facts: status.kind === 'ready'
      ? `${t('ui.n_symbols', { n: String(metacom.symbolCount) })} · ${metacom.rootName}`
      : attention ? t('ui.confirm_access')
        : sourceStatusLine(status),
    ready: metacom.isReady(),
    attention,
  };
}

/* ---------------------------------------------------------------- picker --- */

export interface SourcePickerSpec {
  /** What is chosen now: a source, or null for "follow the default". */
  current: () => ProviderId | null;
  /** Which source a null answer resolves to right now. */
  fallback: () => ProviderId;
  pick: (choice: ProviderId | null) => void;
}

export interface SourcePicker {
  node: HTMLElement;
  /** Redraw against whatever `current()` now answers. */
  draw(): void;
}

/** What a row stands for. `null` is a real answer here, not the absence of one. */
type Choice = ProviderId | null;

/**
 * The list a Sammlung's source is chosen from: follow the default, or one of
 * the two sources by name.
 *
 * **„Standard folgen" is a row of its own, and that is where this parts company
 * with mitreden.** Its picker shows the inherited voice as the answer and makes
 * pressing it the act that turns it into the Sammlung's own — there is no way
 * back, and there does not need to be one, because a voice is a fact about
 * recordings that were made. Here the difference between "METACOM" and
 * "whatever the setting says, which is METACOM today" is a difference somebody
 * can want, and can want to undo: it is the whole of what a default is for. A
 * list where every press is one-way would quietly spend that on the first
 * curious click.
 *
 * A source that cannot draw is shown and not offered. Picking METACOM with no
 * folder in this browser would leave the Sammlung asking for something nothing
 * can answer — bildhaft says so rather than falling back, so the rows would go
 * blank and the banner would explain why, which is a strange thing for a page
 * to do on purpose when the row could simply say what is missing instead. The
 * state still arrives from the outside, from a restored Sicherung, and the
 * banner is what covers it there.
 */
export function sourcePicker(spec: SourcePickerSpec): SourcePicker {
  const list = el('div', { class: 'sources' });

  function row(choice: Choice, label: string, facts: string, blocked: string | null): HTMLElement {
    const live = choice === spec.current();
    const node = el('button', {
      class: `source${live ? ' source--live' : ''}`,
      attrs: {
        type: 'button',
        // A radio, not a pressed button. aria-pressed on a set where exactly
        // one is ever on describes toggles that happen to agree; this is one
        // choice with three answers, and a reader should hear "2 of 3" rather
        // than be left to infer the exclusivity from the drawing.
        role: 'radio',
        'aria-checked': String(live),
        ...(blocked ? { disabled: true } : {}),
      },
      on: { click: () => spec.pick(choice) },
    },
      el('span', { class: 'source__name', text: label }),
      el('span', { class: 'source__facts', text: facts }),
      blocked ? el('span', { class: 'source__hint', text: blocked }) : null,
    );
    // Roving tabindex, so Tab leaves the group rather than walking it.
    node.tabIndex = live ? 0 : -1;
    node.dataset.choice = choice ?? '';
    return node;
  }

  function draw(): void {
    const fallback = sourceFacts(spec.fallback());
    const rows = [row(null, t('ui.follow_default'), t('ui.currently', { what: `${fallback.label} · ${fallback.facts}` }), null)];

    for (const id of PROVIDER_IDS) {
      const facts = sourceFacts(id);
      rows.push(row(id, facts.label, facts.facts, facts.ready ? null
        : t('ui.set_up_first')));
    }

    fill(list, ...rows);
    /* Filtering nothing out cannot hide the chosen row, but a disabled one can:
       a group the keyboard cannot enter at all is worse than one whose entry
       point is not the answer. */
    if (!list.querySelector('.source[tabindex="0"]:not([disabled])')) {
      list.querySelector<HTMLElement>('.source:not([disabled])')?.setAttribute('tabindex', '0');
    }
  }

  /** Arrow keys move the choice, as they do in any radio group. */
  list.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(key)) return;
    // Disabled rows are skipped rather than landed on — the same rule the
    // shared menu keeps, and here it is the METACOM row without a folder.
    const rows = [...list.querySelectorAll<HTMLElement>('.source:not([disabled])')];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (at < 0 || rows.length === 0) return;
    event.preventDefault();
    const to = key === 'Home' ? 0
      : key === 'End' ? rows.length - 1
        : key === 'ArrowDown' || key === 'ArrowRight'
          ? (at + 1) % rows.length
          : (at - 1 + rows.length) % rows.length;
    const next = rows[to]!;
    next.focus();
    spec.pick(next.dataset.choice ? next.dataset.choice as ProviderId : null);
  });

  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', t('ui.symbol_source'));
  draw();
  return { node: list, draw };
}
