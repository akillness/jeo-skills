<!--
@component
A button that empties the input and selects nothing. Shown while there's
something to clear, or always with `keepMounted`.
@stable
-->
<script lang="ts">
  import {
    combobox,
    type ComboboxClearProps,
    type ComboboxClearState,
  } from "@ui-sdk/core/combobox"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    keepMounted,
    ...rest
  }: PartProps<"button", ComboboxClearState> & ComboboxClearProps = $props()

  const clear = usePart(combobox, "clear", () => ({ keepMounted }))
</script>

{#if clear.present}
  <Part tag="button" part={clear} props={rest} />
{/if}
