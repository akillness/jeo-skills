<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Textarea } from "@ui-sdk/svelte/textarea"
</script>

<Field name="message">
  <FieldLabel>Message</FieldLabel>
  <Textarea placeholder="Type your message here…" />
</Field>
