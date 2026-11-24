<script lang="ts">
  import { DateInput } from "@ui-sdk/svelte/date-input"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
</script>

<Field>
  <FieldLabel>Start date</FieldLabel>
  <DateInput defaultValue="2026-11-02" disabled />
</Field>
