<!--
@component
The check inside a selected item. Rendered while it's selected, or always with `keepMounted`.
@stable
-->
<script lang="ts">
  import {
    select as selectPrimitive,
    type SelectItemIndicatorProps,
    type SelectItemIndicatorState,
  } from "@ui-sdk/core/select"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ItemKey, type ItemContext } from "./context"

  let {
    keepMounted,
    ...rest
  }: PartProps<"span", SelectItemIndicatorState> & SelectItemIndicatorProps =
    $props()

  const select = useHandle(selectPrimitive)
  const item = getContext<ItemContext | undefined>(ItemKey)
  if (!item) {
    throw new Error("<SelectItemIndicator> must be used inside <SelectItem>.")
  }
  const indicator = useHandlePart(select, "item-indicator", () => ({
    id: item().key,
    item: item().key,
    keepMounted,
  }))
</script>

{#if indicator.present}
  <Part tag="span" part={indicator} props={rest} />
{/if}
