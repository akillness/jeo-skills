<script lang="ts">
  import { DateInput, DateInputSegment } from "../../src/date-input"
  import { Field, FieldLabel } from "../../src/field"
  import { TimeInput } from "../../src/time-input"

  let {
    which,
    onValueChange,
  }: {
    which: "date" | "time" | "field" | "children" | "readonly"
    onValueChange?: (value: string | null) => void
  } = $props()

  let time = $state<string | null>("09:30")
</script>

{#if which === "date"}
  <DateInput
    name="start"
    defaultValue="2026-11-02"
    locale="en-US"
    onValueChange={(value) => onValueChange?.(value)}
  />
{:else if which === "time"}
  <TimeInput bind:value={time} hourCycle={24} locale="en-US" />
  <output>{time}</output>
{:else if which === "readonly"}
  <DateInput readonly defaultValue="2026-11-02" locale="en-US" />
{:else if which === "field"}
  <Field>
    <FieldLabel>Start date</FieldLabel>
    <DateInput locale="en-US" />
  </Field>
{:else}
  <DateInput defaultValue="2026-11-02" locale="en-US">
    {#snippet children(state)}
      {#each state.segments as segment (segment.key)}
        <DateInputSegment {segment} class="segment-{segment.type}" />
      {/each}
    {/snippet}
  </DateInput>
{/if}
