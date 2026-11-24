<!--
@component
A line between groups of items.
@stable
-->
<script lang="ts">
  import type { ToolbarSeparatorState } from "@ui-sdk/core/toolbar"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useToolbar } from "./context"

  let props: PartProps<"div", ToolbarSeparatorState> = $props()

  const separator = useHandlePart(useToolbar(), "separator")
</script>

<Part tag="div" part={separator} {props} />
