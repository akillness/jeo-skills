<!--
@component
An option. Pressing it selects it, or toggles it with `multiple`.
@stable
-->
<script lang="ts">
  import {
    select as selectPrimitive,
    type SelectItemProps,
    type SelectItemState,
  } from "@ui-sdk/core/select"
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
  }: PartProps<"div", SelectItemState> & SelectItemProps<any> = $props()

  const select = useHandle(selectPrimitive)
  const group = getContext<string | undefined>(GroupKey)
  const key = () => select.api.internal.keyOf(value)
  setContext<ItemContext>(ItemKey, () => ({
    key: key(),
    label: label ?? (typeof value === "string" ? value : undefined),
  }))
  const item = useHandlePart(select, "item", () => ({
    id: key(),
    value,
    label,
    disabled,
    index,
    group,
  }))
</script>

<Part tag="div" part={item} props={rest} />
