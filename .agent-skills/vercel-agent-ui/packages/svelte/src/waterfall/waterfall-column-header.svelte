<!--
@component
A column's header, like "Name" or "Timeline".
@experimental
-->
<script lang="ts">
  import { waterfall } from "@ui-sdk/core/waterfall"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div"> = $props()

  const part = usePart(waterfall, "column-header")
</script>

<Part tag="div" {part} {props} />
