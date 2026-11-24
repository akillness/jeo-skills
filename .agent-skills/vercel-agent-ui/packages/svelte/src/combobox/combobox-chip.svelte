<!--
@component
One selected value. Without children, it shows the value's label.
@stable
-->
<script lang="ts">
  import {
    combobox as comboboxPrimitive,
    type ComboboxChipProps,
    type ComboboxChipState,
  } from "@ui-sdk/core/combobox"
  import { comboboxChips } from "@ui-sdk/core/renderer"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ChipKey, type ChipContext } from "./context"

  let {
    value,
    children,
    ...rest
  }: PartProps<"div", ComboboxChipState> & ComboboxChipProps<any> = $props()

  const combobox = useHandle(comboboxPrimitive)
  combobox.instance.use(comboboxChips)
  setContext<ChipContext>(ChipKey, () => value)
  const chip = useHandlePart(combobox, "chip", () => ({
    id: combobox.api.internal.keyOf(value),
    value,
  }))
</script>

{#snippet label(state: ComboboxChipState)}{state.label}{/snippet}

<Part tag="div" part={chip} props={{ ...rest, children: children ?? label }} />
