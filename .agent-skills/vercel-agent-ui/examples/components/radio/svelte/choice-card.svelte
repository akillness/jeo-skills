<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/svelte/radio"

  const plans = [
    {
      value: "hobby",
      label: "Hobby",
      description: "Free for personal projects.",
    },
    {
      value: "pro",
      label: "Pro",
      description: "$20 per month for growing teams.",
    },
    {
      value: "enterprise",
      label: "Enterprise",
      description: "Custom pricing and support.",
    },
  ]
</script>

<Field>
  <FieldLabel>Plan</FieldLabel>
  <RadioGroup defaultValue="hobby">
    {#each plans as plan (plan.value)}
      <label data-slot="card">
        <span data-slot="stack">
          <span>{plan.label}</span>
          <span data-slot="hint">{plan.description}</span>
        </span>
        <Radio value={plan.value}>
          <RadioIndicator />
        </Radio>
      </label>
    {/each}
  </RadioGroup>
</Field>
