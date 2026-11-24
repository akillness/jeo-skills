<script lang="ts">
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import { Switch, SwitchThumb } from "@ui-sdk/svelte/switch"

  const settings = [
    {
      label: "Public profile",
      description: "Anyone can see your name and photo.",
      defaultChecked: false,
    },
    {
      label: "Show activity status",
      description: "Teammates can see when you're online.",
      defaultChecked: true,
    },
  ]
</script>

<div data-slot="stack">
  {#each settings as setting (setting.label)}
    <Field data-variant="card">
      <div data-slot="stack">
        <FieldLabel>{setting.label}</FieldLabel>
        <FieldDescription>{setting.description}</FieldDescription>
      </div>
      <Switch defaultChecked={setting.defaultChecked}>
        <SwitchThumb />
      </Switch>
    </Field>
  {/each}
</div>
