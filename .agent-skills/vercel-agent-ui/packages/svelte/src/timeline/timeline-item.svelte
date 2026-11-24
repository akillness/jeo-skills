<!--
@component
One event. Arrow keys move between events, and links and buttons inside
stay in the tab order.
@experimental
-->
<script lang="ts">
  import {
    timeline as timelinePrimitive,
    type TimelineItemProps,
    type TimelineItemState,
  } from "@ui-sdk/core/timeline"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ItemKey, type ItemContext } from "./context"

  let {
    value,
    status,
    ...rest
  }: PartProps<"div", TimelineItemState> & TimelineItemProps = $props()

  const timeline = useHandle(timelinePrimitive)
  const generated = $props.id()
  const itemValue = () => value ?? generated
  setContext<ItemContext>(ItemKey, {
    value: itemValue,
    status: () => status,
  })
  const item = useHandlePart(timeline, "item", () => ({
    value: itemValue(),
    status,
  }))
</script>

<Part tag="div" part={item} props={rest} />
