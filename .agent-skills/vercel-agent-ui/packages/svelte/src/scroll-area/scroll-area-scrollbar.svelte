<!--
@component
A scrollbar for one axis, over the viewport's edge.
@stable
-->
<script lang="ts">
  import {
    scrollArea,
    type ScrollAreaScrollbarProps,
    type ScrollAreaScrollbarState,
  } from "@ui-sdk/core/scroll-area"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { OrientationKey, type OrientationContext } from "./context"

  let {
    orientation = "vertical",
    ...rest
  }: PartProps<"div", ScrollAreaScrollbarState> & ScrollAreaScrollbarProps =
    $props()

  setContext<OrientationContext>(OrientationKey, () => orientation)
  const scrollbar = usePart(scrollArea, "scrollbar", () => ({
    id: orientation,
    orientation,
  }))
</script>

<Part tag="div" part={scrollbar} props={rest} />
