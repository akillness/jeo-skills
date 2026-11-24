<!--
@component
The check or dot inside a checkbox or radio item. Rendered while the item
is checked, or always with `keepMounted`.
@stable
-->
<script lang="ts">
  import {
    menu as menuPrimitive,
    type MenuItemIndicatorProps,
    type MenuItemIndicatorState,
  } from "@ui-sdk/core/menu"
  import { menuCheckable } from "@ui-sdk/core/renderer"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ItemKey, type ItemContext } from "./context"

  let {
    keepMounted,
    ...rest
  }: PartProps<"span", MenuItemIndicatorState> & MenuItemIndicatorProps =
    $props()

  const menu = useHandle(menuPrimitive)
  menu.instance.use(menuCheckable)
  const id = $props.id()
  const item = getContext<ItemContext | undefined>(ItemKey)
  if (!item) {
    throw new Error(
      "<MenuItemIndicator> must be used inside a checkbox or radio item."
    )
  }
  const indicator = useHandlePart(menu, "item-indicator", () => ({
    id,
    ...item(),
    keepMounted,
  }))
</script>

{#if indicator.present}
  <Part tag="span" part={indicator} props={rest} />
{/if}
