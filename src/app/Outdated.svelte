<script lang="ts">
  /*
   * The page, stopped: what it read was saved by a newer bildhaft than the one
   * it is running — another device moved on, or this tab stayed open over an
   * update. core/format.ts, adr/0004.
   *
   * Modal, and with nothing to close it. Carrying on is the one thing that must
   * not happen here: this build would draw the newer records as it understands
   * them, which is wrongly, and nothing it wrote would reach the folder
   * (db/folder.ts refuses), so every edit made behind this would be lost on the
   * next start. The only way on is the new build, and that is one reload away.
   *
   * `showModal()` is what makes the rest of the page inert; Escape is refused
   * for the same reason there is no ✕.
   */
  import { t } from '../i18n/index.ts';

  let dialog: HTMLDialogElement;
  $effect(() => { dialog.showModal(); });
</script>

<dialog class="outdated" bind:this={dialog} aria-labelledby="outdated-title" oncancel={(event) => event.preventDefault()}><h2 id="outdated-title">{t('ui.outdated_title')}</h2><p>{t('ui.outdated_text')}</p><p class="small faint">{t('ui.outdated_again')}</p><button class="btn primary" type="button" onclick={() => location.reload()}>{t('ui.outdated_reload')}</button></dialog>
