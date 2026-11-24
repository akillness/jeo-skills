<!--
@component
An icon inside an item. `SelectValueIcon` shows the selected item's in the
trigger. Screen readers, typeahead and filtering skip it, and `mirror`
flips it in right-to-left text.
@stable
-->
<script lang="ts">
  import {
    select as selectPrimitive,
    type SelectItemIconProps,
    type SelectItemIconState,
  } from "@ui-sdk/core/select"
  import { selectItemIcons } from "@ui-sdk/core/renderer"
  import { getContext } from "svelte"
  import { useHandle } from "../instance"
  import ItemIcon from "../item-icon.svelte"
  import type { PartProps } from "../use-primitive.svelte"
  import { ItemKey, type ItemContext } from "./context"

  let {
    ...rest
  }: PartProps<"span", SelectItemIconState> & SelectItemIconProps = $props()

  const select = useHandle(selectPrimitive)
  select.instance.use(selectItemIcons)
  const item = getContext<ItemContext | undefined>(ItemKey)
</script>

<ItemIcon owner={select} partName="item-icon" {item} {...rest} />
