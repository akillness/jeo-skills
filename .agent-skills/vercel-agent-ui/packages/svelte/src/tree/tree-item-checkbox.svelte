<!--
@component
The item's checkbox, with `checkable`. Screen readers hear the item's checked state instead.
@stable
-->
<script lang="ts">
  import {
    tree,
    type TreeItemPartProps,
    type TreeItemState,
  } from "@ui-sdk/core/tree"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { useItem } from "./context"

  let props: PartProps<"span", TreeItemState> & TreeItemPartProps = $props()

  const checkbox = usePart(tree, "checkbox", useItem().partProps)
</script>

<Part tag="span" part={checkbox} {props} />
