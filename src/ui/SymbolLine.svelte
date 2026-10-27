<script lang="ts">
  /**
   * A line of words with its symbols before it: each symbol a button to the
   * picker, a „+" for one more, and the words written where they stand. The
   * title of a material is one (TitleLine), a Plauderbuch's question another
   * — the same line, so they look and answer alike.
   *
   * No label and no Fertig: the words are taken when the field is left or
   * Enter is pressed, as a title's are.
   */
  import type { Snippet } from 'svelte';
  import type { ProviderId, Slot } from '../core/types.ts';
  import { symbolIdFor } from '../core/types.ts';
  import SymbolPicture from '../pieces/Symbol.svelte';

  let { pictures, provider, value, placeholder, textLabel, pictureLabel, addLabel, focus = false, onPick, onAdd, onText, lead }: {
    /** Drawn first on the line: the title's Anybook code. */
    lead?: Snippet;
    /** The symbols with a picture chosen, in their order. */
    pictures: Slot[];
    provider: ProviderId;
    value: string;
    placeholder: string;
    textLabel: string;
    pictureLabel: string;
    addLabel: string;
    /** The caret in the words from the start: an empty material's first line. */
    focus?: boolean;
    onPick: (slot: Slot) => void;
    onAdd: () => void;
    onText: (text: string) => void;
  } = $props();

  function focused(node: HTMLElement, when: boolean): void { if (when) node.focus(); }
</script>

<div class="title-line">{@render lead?.()}{#each pictures as slot (slot.id)}<button class="title-line__pic" type="button" aria-label={pictureLabel} title={pictureLabel} onclick={() => onPick(slot)}><SymbolPicture {provider} id={symbolIdFor(slot, provider)} alt="" mirrored={slot.mirrored} /></button>{/each}<button class="title-line__add" type="button" aria-label={addLabel} title={addLabel} onclick={onAdd}>+</button><input class="title-line__text" type="text" {value} {placeholder} aria-label={textLabel} title={textLabel} use:focused={focus} onchange={(event) => onText(event.currentTarget.value)} onkeydown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></div>
