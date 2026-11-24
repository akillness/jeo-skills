<!--
@component
Radio items that share one value.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    menu as menuPrimitive,
    type MenuRadioGroupProps,
    type MenuRadioGroupState,
    type MenuValueChangeReason,
  } from "@ui-sdk/core/menu"
  import { menuCheckable } from "@ui-sdk/core/renderer"
  import { setContext, untrack } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { RadioGroupKey, type RadioGroupContext } from "./context"

  type ValueDetails = ChangeDetails<MenuValueChangeReason>

  let {
    name,
    value = $bindable(),
    defaultValue,
    onValueChange,
    ...rest
  }: PartProps<"div", MenuRadioGroupState> & MenuRadioGroupProps = $props()

  const menu = useHandle(menuPrimitive)
  menu.instance.use(menuCheckable)
  const generated = $props.id()
  // The name identifies the group for its life, so it's read once.
  const group = untrack(() => name) ?? generated
  setContext<RadioGroupContext>(RadioGroupKey, {
    name: group,
    value: () => value,
  })
  const part = useHandlePart(menu, "radio-group", () => ({
    id: group,
    name: group,
    value,
    defaultValue,
    onValueChange: (next: string, details: ValueDetails) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
  }))
</script>

<Part tag="div" {part} props={rest} />
