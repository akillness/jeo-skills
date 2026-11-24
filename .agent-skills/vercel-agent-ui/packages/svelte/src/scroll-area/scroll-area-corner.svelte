<!--
@component
Where the two scrollbars meet.
@stable
-->
<script lang="ts">
  import { scrollArea } from "@ui-sdk/core/scroll-area"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div"> = $props()

  const part = usePart(scrollArea, "corner")
</script>

<Part tag="div" {part} {props} />
