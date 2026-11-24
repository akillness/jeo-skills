<!--
@component
The months shown, like "October 2026". Screen readers hear it change.
@stable
-->
<script lang="ts">
  import type { CalendarHeadingState } from "@ui-sdk/core/calendar"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useCalendar } from "./context"

  let { children, ...rest }: PartProps<"h2", CalendarHeadingState> = $props()

  const heading = useHandlePart(useCalendar("CalendarHeading"), "heading")
</script>

{#snippet fallback(state: CalendarHeadingState)}{state.label}{/snippet}

<Part
  tag="h2"
  part={heading}
  props={{ ...rest, children: children ?? fallback }}
/>
