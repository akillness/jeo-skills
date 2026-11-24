<script lang="ts">
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import { Textarea } from "@ui-sdk/svelte/textarea"
</script>

<Field name="notes">
  <FieldLabel>Notes</FieldLabel>
  <Textarea autoResize placeholder="Add notes for the delivery driver…" />
  <FieldDescription>Your driver sees these notes.</FieldDescription>
</Field>
