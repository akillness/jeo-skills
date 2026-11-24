<!--
@component
The row of column headers, above the rows.
@experimental
-->
<script lang="ts">
  import { waterfall } from "@ui-sdk/core/waterfall"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div"> = $props()

  const part = usePart(waterfall, "header-row")
</script>

<Part tag="div" {part} {props} />
