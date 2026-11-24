<script lang="ts">
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import { Textarea } from "@ui-sdk/svelte/textarea"

  let bio = $state(
    "Product designer in Lisbon. I write about type and interfaces."
  )
</script>

<Field name="bio">
  <FieldLabel>Bio</FieldLabel>
  <Textarea bind:value={bio} maxlength={160} />
  <FieldDescription>{bio.length} / 160 characters</FieldDescription>
</Field>
