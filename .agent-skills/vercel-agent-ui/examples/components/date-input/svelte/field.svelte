<script lang="ts">
  import { DateInput } from "@ui-sdk/svelte/date-input"
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
</script>

<Field>
  <FieldLabel>Birthday</FieldLabel>
  <DateInput name="birthday" />
  <FieldDescription>We send a card on the day.</FieldDescription>
</Field>
