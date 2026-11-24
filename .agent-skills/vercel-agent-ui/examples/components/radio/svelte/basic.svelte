<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/svelte/radio"

  const speeds = [
    { value: "standard", label: "Standard" },
    { value: "express", label: "Express" },
    { value: "overnight", label: "Overnight" },
  ]
</script>

<Field>
  <FieldLabel>Shipping speed</FieldLabel>
  <RadioGroup defaultValue="standard">
    {#each speeds as speed (speed.value)}
      <label data-slot="label">
        <Radio value={speed.value}>
          <RadioIndicator />
        </Radio>
        {speed.label}
      </label>
    {/each}
  </RadioGroup>
</Field>
