<!--
@component
One item: a link, or a trigger and the content it opens.
@stable
-->
<script lang="ts">
  import {
    navigationMenu,
    type NavigationMenuItemProps,
    type NavigationMenuItemState,
  } from "@ui-sdk/core/navigation-menu"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ItemKey, type ItemContext } from "./context"

  let {
    value,
    ...rest
  }: PartProps<"li", NavigationMenuItemState> & NavigationMenuItemProps =
    $props()

  const menu = useHandle(navigationMenu)
  const generated = $props.id()
  const itemValue = () => value ?? generated
  setContext<ItemContext>(ItemKey, itemValue)
  const item = useHandlePart(menu, "item", () => ({ value: itemValue() }))
</script>

<Part tag="li" part={item} props={rest} />
