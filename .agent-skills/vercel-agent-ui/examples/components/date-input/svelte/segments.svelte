<script lang="ts">
  import { DateInput, DateInputSegment } from "@ui-sdk/svelte/date-input"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
</script>

<Field>
  <FieldLabel>Start date</FieldLabel>
  <DateInput defaultValue="2026-11-02">
    {#snippet children(state)}
      {#each state.segments as segment (segment.key)}
        {#if segment.editable}
          <DateInputSegment {segment} />
        {:else}
          <DateInputSegment {segment}>–</DateInputSegment>
        {/if}
      {/each}
    {/snippet}
  </DateInput>
</Field>
