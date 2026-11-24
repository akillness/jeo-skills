<!--
@component
An item. Put its text in a `TreeItemLabel` and its children in a
`TreeGroup`, which makes it a branch. Set `branch` for one whose children
load later, or whose group is inside a component of your own.
@stable
-->
<script lang="ts">
  import {
    tree as treePrimitive,
    type TreeItemProps,
    type TreeItemState,
  } from "@ui-sdk/core/tree"
  import { getContext, setContext, untrack } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ItemKey, type ItemContext } from "./context"

  let {
    value,
    branch,
    disabled,
    label,
    ...rest
  }: PartProps<"div", TreeItemState> & Omit<TreeItemProps, "parent"> = $props()

  const tree = useHandle(treePrimitive)
  const parent = getContext<ItemContext | undefined>(ItemKey)
  // How many groups joined the item. A group's script runs after the item
  // and its earlier parts rendered, so they render again once one joins.
  let groups = $state(0)
  const grouped = $derived(groups > 0)
  setContext<ItemContext>(ItemKey, {
    value: () => value,
    partProps: () => {
      // Read so the parts hear when the item becomes a branch.
      grouped
      return { value }
    },
    joinGroup: () => {
      // Untracked, since Svelte forbids changing state while a component
      // renders. The item and its parts render again once the render ends.
      untrack(() => groups++)
      return () => untrack(() => groups--)
    },
  })
  const item = useHandlePart(tree, "item", () => ({
    value,
    parent: parent?.value() ?? null,
    branch: branch ?? (grouped || undefined),
    disabled,
    label,
  }))
</script>

<Part tag="div" part={item} props={rest} />
