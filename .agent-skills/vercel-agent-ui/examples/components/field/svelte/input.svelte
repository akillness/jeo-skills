<script lang="ts">
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
</script>

<div data-slot="stack">
  <Field>
    <FieldLabel>Username</FieldLabel>
    <Input name="username" placeholder="hollis" autocomplete="username" />
    <FieldDescription
      >Choose a unique username for your account.</FieldDescription
    >
  </Field>
</div>
