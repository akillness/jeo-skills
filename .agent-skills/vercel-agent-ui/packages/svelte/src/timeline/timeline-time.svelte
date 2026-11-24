<!--
@component
When its event happened, as a `<time>`. Pass `datetime` so machines can
read it. It describes the event.
@experimental
-->
<script lang="ts">
  import { timeline, type TimelineTimeState } from "@ui-sdk/core/timeline"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { useItem } from "./context"

  let props: PartProps<"time", TimelineTimeState> = $props()

  const item = useItem()
  const time = usePart(timeline, "time", () => ({
    value: item.value(),
    status: item.status(),
  }))
</script>

<Part tag="time" part={time} {props} />
