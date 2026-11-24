<!--
@component
A button that empties the field. Shown while there's text to clear, or
always with `keepMounted`. Name it with `aria-label`.
@stable
-->
<script lang="ts">
  import {
    autocomplete,
    type AutocompleteClearProps,
    type AutocompleteClearState,
  } from "@ui-sdk/core/autocomplete"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    keepMounted,
    ...rest
  }: PartProps<"button", AutocompleteClearState> & AutocompleteClearProps =
    $props()

  const clear = usePart(autocomplete, "clear", () => ({ keepMounted }))
</script>

{#if clear.present}
  <Part tag="button" part={clear} props={rest} />
{/if}
