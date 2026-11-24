<!--
@component
How many chips don't fit on the chips' line, once some collapse. Rendering
it inside `ComboboxChips` turns collapsing on. Without content, "+2 more".
@stable
-->
<script lang="ts">
  import {
    combobox as comboboxPrimitive,
    type ComboboxChipsOverflowState,
  } from "@ui-sdk/core/combobox"
  import { comboboxChips } from "@ui-sdk/core/renderer"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"

  let { children, ...rest }: PartProps<"span", ComboboxChipsOverflowState> =
    $props()

  const combobox = useHandle(comboboxPrimitive)
  combobox.instance.use(comboboxChips)
  const overflow = useHandlePart(combobox, "chips-overflow")
</script>

{#snippet count(state: ComboboxChipsOverflowState)}+{state.count} more{/snippet}

<Part
  tag="span"
  part={overflow}
  props={{ ...rest, children: children ?? count }}
/>
