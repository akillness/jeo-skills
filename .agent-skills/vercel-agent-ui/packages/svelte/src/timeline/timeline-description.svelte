<!--
@component
More about its event. It describes the event.
@experimental
-->
<script lang="ts">
  import {
    timeline,
    type TimelineDescriptionState,
  } from "@ui-sdk/core/timeline"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { useItem } from "./context"

  let props: PartProps<"div", TimelineDescriptionState> = $props()

  const item = useItem()
  const description = usePart(timeline, "description", () => ({
    value: item.value(),
    status: item.status(),
  }))
</script>

<Part tag="div" part={description} {props} />
