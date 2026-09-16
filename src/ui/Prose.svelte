<script lang="ts">
  /**
   * A sheet that is a page to read: the three legal and explanatory ones.
   *
   * The prose lives in the text table like every other string here, and the
   * addresses in it do not — info.ts builds the links and drops them into the
   * sentences through placeholders, so a translation can never introduce an
   * href. That is why this takes built HTML rather than keys.
   */
  let { s }: { s: { html: string } } = $props();
</script>

<div>{@html s.html}</div>
