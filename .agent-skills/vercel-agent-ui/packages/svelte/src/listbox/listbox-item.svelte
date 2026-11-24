<!--
@component
An option. Pressing it selects it, or toggles it with `multiple`.
@stable
-->
<script lang="ts">
  import {
    listbox as listboxPrimitive,
    type ListboxItemProps,
    type ListboxItemState,
  } from "@ui-sdk/core/listbox"
  import { getContext, setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey, ItemKey, type ItemContext } from "./context"

  let {
    value,
    label,
    disabled,
    index,
    ...rest
  }: PartProps<"div", ListboxItemState> & ListboxItemProps<any> = $props()

  const listbox = useHandle(listboxPrimitive)
  const group = getContext<string | undefined>(GroupKey)
  const key = () => listbox.api.internal.keyOf(value)
  setContext<ItemContext>(ItemKey, () => ({ key: key() }))
  const item = useHandlePart(listbox, "item", () => ({
    id: key(),
    value,
    label,
    disabled,
    index,
    group,
  }))
</script>

<Part tag="div" part={item} props={rest} />
