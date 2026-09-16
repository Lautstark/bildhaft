<script lang="ts">
  /* No props and no state: the mark is a constant. The script tag earns its
     place all the same — without one svelte-check has no module to type and
     every importer sees `any`. */
</script>

<!--
  The negation cross — METACOM's mark for "nicht". It is stretched to whatever
  box it is put in rather than kept square, so on a wide card it still reads as
  one stroke across the whole symbol. SVG, because it has to stay a line on
  paper at any card size.
-->
<svg class="negate" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" aria-hidden="true"><path d="M10 10 L90 90 M90 10 L10 90" /></svg>
