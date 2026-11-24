<!--
@component
Wraps the content inside the viewport.
@stable
-->
<script lang="ts">
  import { scrollArea, type ScrollAreaState } from "@ui-sdk/core/scroll-area"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", ScrollAreaState> = $props()

  const part = usePart(scrollArea, "content")
</script>

<Part tag="div" {part} {props} />
