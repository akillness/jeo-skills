<!--
@component
Shows the month before. Named "Previous month"; pass `aria-label` in another language.
@stable
-->
<script lang="ts">
  import type { CalendarStepState } from "@ui-sdk/core/calendar"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useCalendar } from "./context"

  let { children, ...rest }: PartProps<"button", CalendarStepState> = $props()

  const step = useHandlePart(useCalendar("CalendarPrevious"), "previous")
</script>

{#snippet fallback()}‹{/snippet}

<Part
  tag="button"
  part={step}
  props={{ ...rest, children: children ?? fallback }}
/>
