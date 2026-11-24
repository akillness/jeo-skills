<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Textarea } from "@ui-sdk/svelte/textarea"
</script>

<Field disabled>
  <FieldLabel>Reply</FieldLabel>
  <Textarea defaultValue="Replies are closed for this thread." />
</Field>
