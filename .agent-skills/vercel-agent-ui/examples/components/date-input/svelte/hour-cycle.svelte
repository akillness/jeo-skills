<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { TimeInput } from "@ui-sdk/svelte/time-input"
</script>

<div data-slot="stack">
  <Field>
    <FieldLabel>12-hour clock</FieldLabel>
    <TimeInput hourCycle={12} defaultValue="18:45" />
  </Field>
  <Field>
    <FieldLabel>24-hour clock</FieldLabel>
    <TimeInput hourCycle={24} defaultValue="18:45" />
  </Field>
  <Field>
    <FieldLabel>With seconds</FieldLabel>
    <TimeInput granularity="second" hourCycle={24} defaultValue="18:45:30" />
  </Field>
</div>
