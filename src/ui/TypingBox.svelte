<script lang="ts">
  /**
   * The box, the button and the two keys — Enter does it, Shift+Enter makes a
   * line.
   *
   * Extracted when the Wortschatz got a composer of its own. It is the same
   * gesture on the same shape in both places, and the alternative was a second
   * textarea that grows on its own timer and disagrees about Enter the first
   * time somebody edits one of them. What differs between the two is wording and
   * the line underneath, so those are props and nothing else is.
   *
   * The placeholder and the accessible name are one prop apiece and both are
   * always given: the placeholder changed with the template and the accessible
   * name did not, so a box that showed „Wörter hinzufügen" announced „Satz
   * eingeben" for a week.
   */
  import type { Snippet } from 'svelte';
  import Icon from '../pieces/Icon.svelte';
  import { LANG } from '../i18n/index.ts';

  /** Past this the box scrolls instead of growing. */
  const MAX_INPUT_HEIGHT = 190;

  let {
    value, busy, placeholder, label, action, meta, after, onChange, onSubmit, focusOnMount = false,
    maxHeight = MAX_INPUT_HEIGHT, enterSubmits = true, onFocus, onBlur, onEscape,
  }: {
    value: string;
    busy: boolean;
    placeholder: string;
    label: string;
    /** What the go button says it does, to a screen reader and on hover. */
    action: string;
    /** The line under the box. Whatever the caller wants said about typing here. */
    meta: Snippet;
    /** Anything that belongs inside the box's own block, under that line. */
    after?: Snippet;
    onChange: (value: string) => void;
    onSubmit: () => void;
    focusOnMount?: boolean;
    /** Past this the box scrolls instead of growing. A Lied's grows tall while it is being edited. */
    maxHeight?: number;
    /** False where a line break is the point — a song, whose blank lines are its parts. */
    enterSubmits?: boolean;
    onFocus?: () => void;
    onBlur?: () => void;
    onEscape?: () => void;
  } = $props();

  let input: HTMLTextAreaElement;

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
    if (!input || window.innerHeight === 0 || document.visibilityState === 'hidden') return;
    input.style.height = '0px';
    input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
  }

  /* The value is the store's, so the field is written from outside too — a
     failed paste comes back into the box. Set only when it actually differs, or
     the caret would jump to the end on every keystroke. */
  $effect(() => {
    if (input.value !== value) { input.value = value; grow(); }
  });

  /* A box that is allowed to grow, or told to shrink again, measures again. */
  $effect(() => {
    void maxHeight;
    grow();
  });

  $effect(() => {
    document.addEventListener('visibilitychange', grow);
    window.addEventListener('resize', grow);
    void document.fonts?.ready.then(grow).catch(() => undefined);
    return () => {
      document.removeEventListener('visibilitychange', grow);
      window.removeEventListener('resize', grow);
    };
  });

  /* Focused on load: typing is the entire interaction. Skipped on touch devices,
     where it would immediately open the on-screen keyboard and shrink the viewport.
     Nor taken from a field that already has it: a Satzstreifen's box comes after
     its head, whose name field a new Material focuses first. */
  $effect(() => {
    const busy = document.activeElement?.matches('input, textarea, [contenteditable="true"]');
    if (focusOnMount && !busy && !window.matchMedia('(hover: none)').matches) input.focus();
  });

  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && onEscape) {
      event.preventDefault();
      onEscape();
      input.blur();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && enterSubmits) {
      event.preventDefault();
      onSubmit();
    }
  };
</script>

<div class="composer"><div class="composer__box"><textarea bind:this={input} class="composer__input" rows="1" {placeholder} aria-label={label} spellcheck="true" lang={LANG} oninput={() => { onChange(input.value); grow(); }} onkeydown={keydown} onfocus={onFocus} onblur={onBlur}></textarea><button class="btn primary composer__go" type="button" aria-label={action} title={action} disabled={busy || !value.trim()} onclick={onSubmit}><span>{#if busy}<span class="spinner"></span>{:else}<Icon name="arrow" />{/if}</span></button></div><div class="composer__meta">{@render meta()}</div>{@render after?.()}</div>
