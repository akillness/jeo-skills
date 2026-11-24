<!--
@component
The check inside a selected item. Rendered while it's selected, or always with `keepMounted`.
@stable
-->
<script lang="ts">
  import {
    combobox as comboboxPrimitive,
    type ComboboxItemIndicatorProps,
    type ComboboxItemIndicatorState,
  } from "@ui-sdk/core/combobox"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ItemKey, type ItemContext } from "./context"

  let {
    keepMounted,
    ...rest
  }: PartProps<"span", ComboboxItemIndicatorState> &
    ComboboxItemIndicatorProps = $props()

  const combobox = useHandle(comboboxPrimitive)
  const item = getContext<ItemContext | undefined>(ItemKey)
  if (!item) {
    throw new Error(
      "<ComboboxItemIndicator> must be used inside <ComboboxItem>."
    )
  }
  const indicator = useHandlePart(combobox, "item-indicator", () => ({
    id: item().key,
    item: item().key,
    keepMounted,
  }))
</script>

{#if indicator.present}
  <Part tag="span" part={indicator} props={rest} />
{/if}
