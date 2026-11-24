<!--
@component
The check inside a selected item. Rendered while it's selected, or always with `keepMounted`.
@stable
-->
<script lang="ts">
  import {
    listbox as listboxPrimitive,
    type ListboxItemIndicatorProps,
    type ListboxItemIndicatorState,
  } from "@ui-sdk/core/listbox"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ItemKey, type ItemContext } from "./context"

  let {
    keepMounted,
    ...rest
  }: PartProps<"span", ListboxItemIndicatorState> & ListboxItemIndicatorProps =
    $props()

  const listbox = useHandle(listboxPrimitive)
  const item = getContext<ItemContext | undefined>(ItemKey)
  if (!item) {
    throw new Error("<ListboxItemIndicator> must be used inside <ListboxItem>.")
  }
  const indicator = useHandlePart(listbox, "item-indicator", () => ({
    id: item().key,
    item: item().key,
    keepMounted,
  }))
</script>

{#if indicator.present}
  <Part tag="span" part={indicator} props={rest} />
{/if}
