<!--
@component
An option. Pressing it selects it, or toggles it with `multiple`.
@stable
-->
<script lang="ts">
  import {
    combobox as comboboxPrimitive,
    type ComboboxItemProps,
    type ComboboxItemState,
  } from "@ui-sdk/core/combobox"
  import { getContext, setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey, ItemKey, type ItemContext } from "./context"

  let {
    value,
    label,
    keywords,
    disabled,
    index,
    ...rest
  }: PartProps<"div", ComboboxItemState> & ComboboxItemProps<any> = $props()

  const combobox = useHandle(comboboxPrimitive)
  const group = getContext<string | undefined>(GroupKey)
  const key = () => combobox.api.internal.keyOf(value)
  setContext<ItemContext>(ItemKey, () => ({
    key: key(),
    label: label ?? (typeof value === "string" ? value : undefined),
  }))
  const item = useHandlePart(combobox, "item", () => ({
    id: key(),
    value,
    label,
    keywords,
    disabled,
    index,
    group,
  }))
</script>

<Part tag="div" part={item} props={rest} />
