<!--
@component
An item that checks and unchecks an option.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    menu as menuPrimitive,
    type MenuCheckboxItemProps,
    type MenuCheckboxItemState,
    type MenuCheckedChangeReason,
  } from "@ui-sdk/core/menu"
  import { menuCheckable } from "@ui-sdk/core/renderer"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ItemKey, type ItemContext } from "./context"

  type CheckedDetails = ChangeDetails<MenuCheckedChangeReason>

  let {
    value,
    label,
    disabled,
    checked = $bindable(),
    defaultChecked,
    closeOnSelect,
    onCheckedChange,
    ...rest
  }: PartProps<"div", MenuCheckboxItemState> & MenuCheckboxItemProps = $props()

  const menu = useHandle(menuPrimitive)
  menu.instance.use(menuCheckable)
  setContext<ItemContext>(ItemKey, () => {
    // The indicator shows a controlled `checked`, which the core reads from
    // the item's props, so it reads it here to render again when it changes.
    checked
    return { item: "checkbox-item", itemKey: value }
  })
  const item = useHandlePart(menu, "checkbox-item", () => ({
    value,
    label,
    disabled,
    checked,
    defaultChecked,
    closeOnSelect,
    onCheckedChange: (next: boolean, details: CheckedDetails) => {
      // The callback runs first, so canceling there also keeps a bound `checked` as it was.
      onCheckedChange?.(next, details)
      if (!details.canceled) {
        checked = next
      }
    },
  }))
</script>

<Part tag="div" part={item} props={rest} />
