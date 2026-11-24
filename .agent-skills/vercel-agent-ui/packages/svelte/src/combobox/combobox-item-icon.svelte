<!--
@component
An icon inside an item. `ComboboxValueIcon` shows the selected item's
next to the input. Screen readers, typeahead and filtering skip it, and
`mirror` flips it in right-to-left text.
@stable
-->
<script lang="ts">
  import {
    combobox as comboboxPrimitive,
    type ComboboxItemIconProps,
    type ComboboxItemIconState,
  } from "@ui-sdk/core/combobox"
  import { comboboxItemIcons } from "@ui-sdk/core/renderer"
  import { getContext } from "svelte"
  import { useHandle } from "../instance"
  import ItemIcon from "../item-icon.svelte"
  import type { PartProps } from "../use-primitive.svelte"
  import { ItemKey, type ItemContext } from "./context"

  let {
    ...rest
  }: PartProps<"span", ComboboxItemIconState> & ComboboxItemIconProps = $props()

  const combobox = useHandle(comboboxPrimitive)
  combobox.instance.use(comboboxItemIcons)
  const item = getContext<ItemContext | undefined>(ItemKey)
</script>

<ItemIcon owner={combobox} partName="item-icon" {item} {...rest} />
