<!--
@component
The part of the scrollbar that shows where the view is, and drags.
@stable
-->
<script lang="ts">
  import {
    scrollArea,
    type ScrollAreaThumbState,
  } from "@ui-sdk/core/scroll-area"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { OrientationKey, type OrientationContext } from "./context"

  let props: PartProps<"div", ScrollAreaThumbState> = $props()

  const orientation =
    getContext<OrientationContext | undefined>(OrientationKey) ??
    (() => "vertical" as const)
  const thumb = usePart(scrollArea, "thumb", () => ({
    id: orientation(),
    orientation: orientation(),
  }))
</script>

<Part tag="div" part={thumb} {props} />
