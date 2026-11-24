<!--
@component
A button that scrolls to the end, like "Jump to latest". Name it with its content.
@stable
-->
<script lang="ts">
  import {
    scrollArea,
    type ScrollAreaScrollToEndState,
  } from "@ui-sdk/core/scroll-area"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"button", ScrollAreaScrollToEndState> = $props()

  const part = usePart(scrollArea, "scroll-to-end")
</script>

<Part tag="button" {part} {props} />
