<!--
@component
What happened. It names its event.
@experimental
-->
<script lang="ts">
  import { timeline, type TimelineTitleState } from "@ui-sdk/core/timeline"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { useItem } from "./context"

  let props: PartProps<"div", TimelineTitleState> = $props()

  const item = useItem()
  const title = usePart(timeline, "title", () => ({
    value: item.value(),
    status: item.status(),
  }))
</script>

<Part tag="div" part={title} {props} />
