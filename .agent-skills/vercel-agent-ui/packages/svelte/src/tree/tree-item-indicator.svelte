<!--
@component
The arrow that expands and collapses a branch. Alt or Option expands everything in it.
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

  const indicator = usePart(tree, "indicator", useItem().partProps)
</script>

<Part tag="span" part={indicator} {props} />
