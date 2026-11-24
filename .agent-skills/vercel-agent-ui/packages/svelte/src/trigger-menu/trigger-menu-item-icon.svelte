<!--
@component
An icon inside a suggestion. Screen readers, typeahead and filtering
skip it, and `mirror` flips it in right-to-left text.
@stable
-->
<script lang="ts">
  import {
    triggerMenu,
    type TriggerMenuItemIconProps,
    type TriggerMenuItemIconState,
  } from "@ui-sdk/core/trigger-menu"
  import { useHandle } from "../instance"
  import ItemIcon from "../item-icon.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    ...rest
  }: PartProps<"span", TriggerMenuItemIconState> & TriggerMenuItemIconProps =
    $props()

  const menu = useHandle(triggerMenu)
</script>

<ItemIcon owner={menu} partName="item-icon" {...rest} />
