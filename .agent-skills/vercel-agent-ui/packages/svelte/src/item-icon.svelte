<script lang="ts" generics="State extends { mirror: boolean }">
  import type { ItemIconProps } from "@ui-sdk/core/renderer"
  import { untrack } from "svelte"
  import Part from "./part.svelte"
  import {
    useHandlePart,
    type PartBinding,
    type PartProps,
    type PrimitiveHandle,
  } from "./use-primitive.svelte"

  // The icon part every component with items shares, like ListboxItemIcon and
  // SelectItemIcon. The core hides it from screen readers and typeahead.
  // `owner` and `partName` are read once. `item` finds the key of the item
  // it's in, for a list whose value shows the selected item's icon.
  let {
    owner,
    partName,
    item,
    mirror,
    ...rest
  }: PartProps<"span", State> &
    ItemIconProps & {
      owner: PrimitiveHandle<any>
      partName: string
      item?: () => { key: string }
    } = $props()

  const id = $props.id()
  const part = useHandlePart<any, string>(
    untrack(() => owner),
    untrack(() => partName),
    () => ({ id, mirror, item: item?.().key })
  )
</script>

<Part tag="span" part={part as PartBinding<State>} props={rest} />
