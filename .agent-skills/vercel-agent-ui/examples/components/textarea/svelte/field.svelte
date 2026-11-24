<script lang="ts">
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import { Textarea } from "@ui-sdk/svelte/textarea"
</script>

<Field name="feedback">
  <FieldLabel>Feedback</FieldLabel>
  <Textarea placeholder="What could we do better?" />
  <FieldDescription>Only the product team can see this.</FieldDescription>
</Field>
