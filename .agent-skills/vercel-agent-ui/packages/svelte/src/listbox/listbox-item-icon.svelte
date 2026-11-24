<!--
@component
An icon inside an item. Screen readers and typeahead skip it, and `mirror` flips it in right-to-left text.
@stable
-->
<script lang="ts">
  import {
    listbox as listboxPrimitive,
    type ListboxItemIconProps,
    type ListboxItemIconState,
  } from "@ui-sdk/core/listbox"
  import { getContext } from "svelte"
  import { useHandle } from "../instance"
  import ItemIcon from "../item-icon.svelte"
  import type { PartProps } from "../use-primitive.svelte"
  import { ItemKey, type ItemContext } from "./context"

  let {
    ...rest
  }: PartProps<"span", ListboxItemIconState> & ListboxItemIconProps = $props()

  const listbox = useHandle(listboxPrimitive)
  const item = getContext<ItemContext | undefined>(ItemKey)
</script>

<ItemIcon owner={listbox} partName="item-icon" {item} {...rest} />
