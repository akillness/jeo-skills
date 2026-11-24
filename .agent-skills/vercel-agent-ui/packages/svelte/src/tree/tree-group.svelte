<!--
@component
A branch's children. Rendered while the branch is expanded or animating closed.
@stable
-->
<script lang="ts">
  import {
    tree,
    type TreeGroupProps,
    type TreeGroupState,
  } from "@ui-sdk/core/tree"
  import { onDestroy } from "svelte"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { useItem } from "./context"

  let {
    keepMounted,
    hiddenUntilFound,
    ...rest
  }: PartProps<"div", TreeGroupState> & TreeGroupProps = $props()

  const item = useItem()
  // The group makes its item a branch, mounted or not.
  onDestroy(item.joinGroup())
  const group = usePart(tree, "group", () => ({
    value: item.value(),
    keepMounted,
    hiddenUntilFound,
  }))
</script>

{#if group.present}
  <Part tag="div" part={group} props={rest} />
{/if}
