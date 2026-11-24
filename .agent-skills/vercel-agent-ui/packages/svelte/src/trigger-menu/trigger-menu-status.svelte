<!--
@component
A polite status, outside the popup. Without children, it says the count and the keys once typing pauses.
@stable
-->
<script lang="ts">
  import {
    triggerMenu,
    type TriggerMenuStatusState,
  } from "@ui-sdk/core/trigger-menu"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let { children, ...rest }: PartProps<"div", TriggerMenuStatusState> = $props()

  const status = usePart(triggerMenu, "status", () => ({ text: !children }))
</script>

<Part tag="div" part={status} props={{ ...rest, children }} />
