<!--
@component
A native select of the months, in the locale, that turns the first month shown.
@stable
-->
<script lang="ts">
  import type { CalendarSelectState } from "@ui-sdk/core/calendar"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useCalendar } from "./context"

  let { children, ...rest }: PartProps<"select", CalendarSelectState> = $props()

  const select = useHandlePart(
    useCalendar("CalendarMonthSelect"),
    "month-select"
  )
</script>

{#snippet fallback(state: CalendarSelectState)}
  {#each state.options as option (option.value)}
    {@const selected = option.value === state.value}
    <!-- Selected on the server too; the core writes the select's value once it binds. -->
    <option value={String(option.value)} disabled={option.disabled} {selected}
      >{option.label}</option
    >
  {/each}
{/snippet}

<Part
  tag="select"
  part={select}
  props={{ ...rest, children: children ?? fallback }}
/>
