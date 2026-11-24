<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { TimeInput } from "@ui-sdk/svelte/time-input"
</script>

<Field>
  <FieldLabel>Meeting time</FieldLabel>
  <TimeInput defaultValue="09:30" />
</Field>
