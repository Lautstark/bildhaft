<script lang="ts">
  /**
   * Where an Anybook code goes: on a card's symbol box, before the title.
   *
   * On paper a dashed circle for a sticker, or — on the sheet handed to Anybook
   * Studio — a white disc with a ring that Studio prints the code into. In the
   * preview it is also what is tapped to change what the code says or to take
   * it off (PrintView), so it carries its key and its words; a code taken off
   * is shown there faintly and printed nowhere.
   */
  import type { PrintSettings } from '../core/types.ts';
  import { anybookMark } from '../core/anybook.ts';

  let { settings, key, standing, title = false, start = false }: {
    settings: PrintSettings;
    /** A slot's id, or ANYBOOK_TITLE. */
    key: string;
    /** What stands there, which the code says unless told otherwise. */
    standing: string;
    title?: boolean;
    /** The activation code: no words, nothing to change, only where it goes. */
    start?: boolean;
  } = $props();

  let mark = $derived(anybookMark(settings, key, standing));
</script>

<span class="ps-any{title ? ' ps-any--title' : ''}{start ? ' ps-any--start' : ''}{mark.off ? ' ps-any--off' : ''}{mark.own ? ' ps-any--own' : ''}" data-any={key} data-said={mark.said} data-standing={standing} aria-hidden="true"></span>
