<script lang="ts">
  import { DateInput } from "@ui-sdk/svelte/date-input"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
</script>

<Field>
  <FieldLabel>Departure</FieldLabel>
  <DateInput granularity="minute" defaultValue="2026-11-02T14:30" />
</Field>
