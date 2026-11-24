<!--
@component
The dot or icon that marks its event on the line. Hidden from assistive
technology.
@experimental
-->
<script lang="ts">
  import { timeline, type TimelineMarkerState } from "@ui-sdk/core/timeline"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { useItem } from "./context"

  let props: PartProps<"div", TimelineMarkerState> = $props()

  const item = useItem()
  const marker = usePart(timeline, "marker", () => ({
    value: item.value(),
    status: item.status(),
  }))
</script>

<Part tag="div" part={marker} {props} />
