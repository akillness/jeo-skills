<!--
@component
The native scroller. Keyboard, wheels, touch, find in page and screen readers scroll it.
@stable
-->
<script lang="ts">
  import { scrollArea, type ScrollAreaState } from "@ui-sdk/core/scroll-area"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", ScrollAreaState> = $props()

  const part = usePart(scrollArea, "viewport")
</script>

<Part tag="div" {part} {props} />
