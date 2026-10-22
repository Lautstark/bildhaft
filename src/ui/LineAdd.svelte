<script lang="ts">
  /**
   * „+ Schritt" and the line it opens: how something is typed into the
   * material where it will stand — a Schritt under the Schritte, an Aussage
   * under its page, a line under its Strophe. One look and one way for all of
   * them, so that adding feels the same wherever it is done.
   *
   * Enter adds and the field stays for the next line; Escape closes it, and
   * so does leaving it empty. Lines are sent one after the other (inTurn):
   * the next can be typed while the last is still being looked up. What the
   * source could not take comes back into the field.
   *
   * Which part has its field open is the caller's: one at a time, and the
   * caller closes it when something else is opened.
   */
  import { inTurn } from '../app/inTurn.ts';
  import { t } from '../i18n/index.ts';

  let { open, plus, label, placeholder, onOpen, onClose, onSend }: {
    open: boolean;
    /* The button's own words, „+ Schritt". */
    plus: string;
    label: string;
    placeholder?: string;
    onOpen: () => void;
    onClose: () => void;
    /* Adds the line; returns what is left of it, if anything. */
    onSend: (raw: string) => Promise<string | null | undefined>;
  } = $props();

  let line = $state('');

  const send = inTurn();
  function sendLine(): void {
    const raw = line;
    if (!raw.trim()) return;
    line = '';
    send(async () => {
      const left = await onSend(raw);
      if (left) line = line ? `${left}\n${line}` : left;
    });
  }

  function keys(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendLine(); }
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
  }
  /* Not disabled while a line is looked up: a disabled field drops the
     focus, and the field went with it, so the next line had nowhere to go. */
  /* Left empty, the field goes — a moment after, so the click that took the
     focus lands where it was aimed before the page moves under it. */
  function left(): void {
    window.setTimeout(() => { if (!line.trim() && open) onClose(); }, 150);
  }

  function focused(node: HTMLElement): void { node.focus(); }
</script>

{#if open}<div class="line-add"><input class="line-add__input" use:focused bind:value={line} aria-label={label} {placeholder} onkeydown={keys} onblur={left} /><button class="btn sm" type="button" disabled={!line.trim()} onclick={sendLine}>{t('ui.song_add')}</button></div>{:else}<button class="song__plus" type="button" onclick={(event) => { event.stopPropagation(); line = ''; onOpen(); }}>{plus}</button>{/if}
