<!--
@component
An item in a `MenuRadioGroup`. Pressing it checks its value.
@stable
-->
<script lang="ts">
  import {
    menu as menuPrimitive,
    type MenuRadioItemProps,
    type MenuRadioItemState,
  } from "@ui-sdk/core/menu"
  import { menuCheckable } from "@ui-sdk/core/renderer"
  import { getContext, setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import {
    ItemKey,
    RadioGroupKey,
    type ItemContext,
    type RadioGroupContext,
  } from "./context"

  let {
    value,
    label,
    disabled,
    closeOnSelect,
    ...rest
  }: PartProps<"div", MenuRadioItemState> & MenuRadioItemProps = $props()

  const menu = useHandle(menuPrimitive)
  menu.instance.use(menuCheckable)
  const radioGroup = getContext<RadioGroupContext | undefined>(RadioGroupKey)
  if (!radioGroup) {
    throw new Error("<MenuRadioItem> must be used inside <MenuRadioGroup>.")
  }
  const group = radioGroup.name
  // Whether the item is checked follows the group's controlled value, which
  // the core reads from the group's props, so the item and its indicator
  // read it here to render again when it changes.
  setContext<ItemContext>(
    ItemKey,
    () => (radioGroup.value(), { item: "radio-item", itemKey: value, group })
  )
  const item = useHandlePart(
    menu,
    "radio-item",
    () => (radioGroup.value(), { group, value, label, disabled, closeOnSelect })
  )
</script>

<Part tag="div" part={item} props={rest} />
