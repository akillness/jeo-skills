<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/svelte/radio"

  const themes = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ]
</script>

<Field>
  <FieldLabel>Theme</FieldLabel>
  <RadioGroup defaultValue="system">
    {#each themes as theme (theme.value)}
      <label data-slot="label">
        <Radio value={theme.value}>
          <RadioIndicator keepMounted />
        </Radio>
        {theme.label}
      </label>
    {/each}
  </RadioGroup>
</Field>
