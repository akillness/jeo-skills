<!--
@component
An arrow on the card's edge that points at its trigger.
@stable
-->
<script lang="ts">
  import { hoverCard, type HoverCardArrowState } from "@ui-sdk/core/hover-card"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", HoverCardArrowState> = $props()

  const arrow = usePart(hoverCard, "arrow")
</script>

<Part tag="div" part={arrow} {props} />
