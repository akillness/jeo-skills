<!--
@component
The selected value, for rendering chips or a summary. `children` gets its
state. Without children, it shows the label. Renders no element.
@stable
-->
<script lang="ts">
  import {
    combobox,
    type ComboboxValueProps,
    type ComboboxValueState,
  } from "@ui-sdk/core/combobox"
  import type { Snippet } from "svelte"
  import { usePart } from "../instance"

  let {
    maxLabels,
    getMoreLabel,
    children,
  }: ComboboxValueProps & {
    /** Content. Receives the value's state: `value`, `labels` and `label`. */
    children?: Snippet<[ComboboxValueState]>
  } = $props()

  const value = usePart(combobox, "value", () => ({ maxLabels, getMoreLabel }))
</script>

{#if children}{@render children(value.state)}{:else}{value.state.label}{/if}
