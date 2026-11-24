<!--
@component
A suggestion. Choosing it inserts it into the text.
@stable
-->
<script lang="ts">
  import {
    triggerMenu,
    type TriggerMenuItemProps,
    type TriggerMenuItemState,
  } from "@ui-sdk/core/trigger-menu"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let {
    value,
    label,
    keywords,
    disabled,
    onSelect,
    ...rest
  }: PartProps<"div", TriggerMenuItemState> & TriggerMenuItemProps<any> =
    $props()

  const menu = useHandle(triggerMenu)
  const group = getContext<string | undefined>(GroupKey)
  const item = useHandlePart(menu, "item", () => ({
    id: menu.api.internal.keyOf(value),
    value,
    label,
    keywords,
    disabled,
    onSelect,
    group,
  }))
</script>

<Part tag="div" part={item} props={rest} />
