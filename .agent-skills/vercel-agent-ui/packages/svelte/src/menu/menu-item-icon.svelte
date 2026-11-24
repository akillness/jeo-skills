<!--
@component
An icon inside an item or a submenu trigger. Screen readers and typeahead
skip it, and `mirror` flips it in right-to-left text.
@stable
-->
<script lang="ts">
  import {
    menu as menuPrimitive,
    type MenuItemIconProps,
    type MenuItemIconState,
  } from "@ui-sdk/core/menu"
  import { menuItemIcons } from "@ui-sdk/core/renderer"
  import { useHandle } from "../instance"
  import ItemIcon from "../item-icon.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let { ...rest }: PartProps<"span", MenuItemIconState> & MenuItemIconProps =
    $props()

  const menu = useHandle(menuPrimitive)
  menu.instance.use(menuItemIcons)
</script>

<ItemIcon owner={menu} partName="item-icon" {...rest} />
