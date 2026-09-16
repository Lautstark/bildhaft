<script lang="ts">
  /**
   * The `⋯` trigger this app draws, wired to the shared menu.
   *
   * What the popover *does* — where focus goes on open and where it returns to,
   * the arrows and Home/End, what a second press on the trigger means, what
   * closes it — is @lautstark/design/menu, beside the CSS in components.css
   * that has drawn `.menu` since v1.7.0. This is what is left: the button,
   * which the shared module deliberately does not own, because one product
   * draws a `⋯` here and another a labelled dropdown and the markup belongs
   * with the page that reads.
   *
   * The item shape is the shared one: `build` is handed an `add(label, run,
   * opts)`, which is the form whose named options stopped the third argument
   * meaning "destructive" in one product and "in force" in another.
   */
  import { menuOn, type AddItem } from '@lautstark/design/menu';
  import Icon from '../pieces/Icon.svelte';

  let { label, build }: { label: string; build: (add: AddItem) => void } = $props();
  let trigger: HTMLButtonElement;
</script>

<!-- menuOn toggles on aria-expanded, so a second press is a dismissal without
     this file tracking whether anything is open. -->
<div class="menu-anchor"><button bind:this={trigger} class="btn quiet icon" type="button" aria-haspopup="menu" aria-expanded="false" aria-label={label} title={label} onclick={() => menuOn(trigger, build)}><Icon name="dots" /></button></div>
