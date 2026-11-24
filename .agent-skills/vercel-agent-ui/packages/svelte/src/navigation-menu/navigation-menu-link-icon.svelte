<!--
@component
An icon inside a link. Screen readers skip it, and `mirror` flips it in
right-to-left text.
@stable
-->
<script lang="ts">
  import {
    navigationMenu,
    type NavigationMenuLinkIconProps,
    type NavigationMenuLinkIconState,
  } from "@ui-sdk/core/navigation-menu"
  import { useHandle } from "../instance"
  import ItemIcon from "../item-icon.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    ...rest
  }: PartProps<"span", NavigationMenuLinkIconState> &
    NavigationMenuLinkIconProps = $props()

  const menu = useHandle(navigationMenu)
</script>

<ItemIcon owner={menu} partName="link-icon" {...rest} />
