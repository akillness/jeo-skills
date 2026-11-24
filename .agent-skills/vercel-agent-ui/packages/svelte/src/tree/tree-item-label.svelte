<!--
@component
The item's text, which names it. Render it as a link to make the item one.
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

  const label = usePart(tree, "label", useItem().partProps)
</script>

<Part tag="span" part={label} {props} />
