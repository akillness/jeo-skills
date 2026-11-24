<script lang="ts">
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import { Switch, SwitchThumb } from "@ui-sdk/svelte/switch"
</script>

<Field>
  <div data-slot="stack">
    <FieldLabel>Weekly digest</FieldLabel>
    <FieldDescription>A summary of your week, every Monday.</FieldDescription>
  </div>
  <Switch>
    <SwitchThumb />
  </Switch>
</Field>
