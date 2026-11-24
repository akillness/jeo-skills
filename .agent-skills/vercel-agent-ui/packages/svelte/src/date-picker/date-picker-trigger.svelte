<!--
@component
Opens the calendar. Named "Choose date" and the date chosen; pass `aria-label` in another language.
@stable
-->
<script lang="ts">
  import type { DatePickerTriggerState } from "@ui-sdk/core/date-picker"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useDatePicker } from "./context"

  let { children, ...rest }: PartProps<"button", DatePickerTriggerState> =
    $props()

  const trigger = useHandlePart(useDatePicker("DatePickerTrigger"), "trigger")
</script>

{#snippet fallback()}
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
  </svg>
{/snippet}

<Part
  tag="button"
  part={trigger}
  props={{ ...rest, children: children ?? fallback }}
/>
