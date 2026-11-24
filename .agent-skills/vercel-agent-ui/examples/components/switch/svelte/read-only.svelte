<script lang="ts">
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import { Switch, SwitchThumb } from "@ui-sdk/svelte/switch"
</script>

<Field>
  <div data-slot="stack">
    <FieldLabel>Encrypt backups</FieldLabel>
    <FieldDescription>Your organization manages this setting.</FieldDescription>
  </div>
  <Switch name="encrypt" defaultChecked readOnly>
    <SwitchThumb />
  </Switch>
</Field>
