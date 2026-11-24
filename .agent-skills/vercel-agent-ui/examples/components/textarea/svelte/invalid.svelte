<script lang="ts">
  import { Field, FieldError, FieldLabel } from "@ui-sdk/svelte/field"
  import { Textarea } from "@ui-sdk/svelte/textarea"
</script>

<Field invalid>
  <FieldLabel>Review</FieldLabel>
  <Textarea defaultValue="Great." />
  <FieldError match>Write at least 20 characters.</FieldError>
</Field>
