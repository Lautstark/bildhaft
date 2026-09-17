<script lang="ts">
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
  import type { ProviderId } from '../core/types.ts';
  import { PROVIDER_IDS } from '@lautstark/bildquelle';
  import { sourceFacts } from './symbolSources.ts';
  import { t } from '../i18n/index.ts';

  /** What a row stands for. `null` is a real answer here, not the absence of one. */
  type Choice = ProviderId | null;

  let { current, fallback, pick }: {
    current: Choice;
    /** Which source a null answer resolves to right now. */
    fallback: ProviderId;
    pick: (choice: Choice) => void;
  } = $props();

  let list: HTMLElement;

  interface Row { choice: Choice; label: string; facts: string; blocked: string | null }

  let rows = $derived.by<Row[]>(() => {
    const under = sourceFacts(fallback);
    const out: Row[] = [{
      choice: null,
      label: t('ui.follow_default'),
      facts: t('ui.currently', { what: `${under.label} · ${under.facts}` }),
      blocked: null,
    }];
    for (const id of PROVIDER_IDS) {
      const facts = sourceFacts(id);
      out.push({
        choice: id, label: facts.label, facts: facts.facts,
        blocked: facts.ready ? null : t('ui.set_up_first'),
      });
    }
    return out;
  });

  /* Roving tabindex, so Tab leaves the group rather than walking it.
     Filtering nothing out cannot hide the chosen row, but a disabled one can:
     a group the keyboard cannot enter at all is worse than one whose entry
     point is not the answer. */
  let entry = $derived.by(() => {
    const live = rows.find((row) => row.choice === current && !row.blocked);
    return (live ?? rows.find((row) => !row.blocked))?.choice ?? null;
  });

  /** Arrow keys move the choice, as they do in any radio group. */
  function keys(event: KeyboardEvent): void {
    const key = event.key;
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(key)) return;
    // Disabled rows are skipped rather than landed on — the same rule the
    // shared menu keeps, and here it is the METACOM row without a folder.
    const open = [...list.querySelectorAll<HTMLElement>('.source:not([disabled])')];
    const at = open.indexOf(document.activeElement as HTMLElement);
    if (at < 0 || open.length === 0) return;
    event.preventDefault();
    const to = key === 'Home' ? 0
      : key === 'End' ? open.length - 1
        : key === 'ArrowDown' || key === 'ArrowRight'
          ? (at + 1) % open.length
          : (at - 1 + open.length) % open.length;
    const next = open[to]!;
    next.focus();
    pick(next.dataset.choice ? next.dataset.choice as ProviderId : null);
  }
</script>

<!-- The group itself takes no tab stop: the rows do, one at a time, which is
     what the roving tabindex below is. -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div bind:this={list} class="sources" role="radiogroup" aria-label={t('ui.symbol_source')} onkeydown={keys}>{#each rows as row (row.choice ?? '')}<button class="source{row.choice === current ? ' source--live' : ''}" type="button" data-choice={row.choice ?? ''} tabindex={row.choice === entry ? 0 : -1} disabled={row.blocked !== null} role="radio" aria-checked={row.choice === current} onclick={() => pick(row.choice)}><!--
  A radio, not a pressed button. aria-pressed on a set where exactly one is ever
  on describes toggles that happen to agree; this is one choice with three
  answers, and a reader should hear "2 of 3" rather than be left to infer the
  exclusivity from the drawing.
--><span class="source__name">{row.label}</span><span class="source__facts">{row.facts}</span>{#if row.blocked}<span class="source__hint">{row.blocked}</span>{/if}</button>{/each}</div>
