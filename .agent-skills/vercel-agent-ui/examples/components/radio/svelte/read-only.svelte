<script lang="ts">
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/svelte/radio"

  const plans = [
    { value: "free", label: "Free" },
    { value: "pro", label: "Pro" },
    { value: "team", label: "Team" },
  ]
</script>

<Field>
  <FieldLabel>Your plan</FieldLabel>
  <FieldDescription>Ask an admin to change plans.</FieldDescription>
  <RadioGroup defaultValue="pro" readOnly>
    {#each plans as plan (plan.value)}
      <label data-slot="label">
        <Radio value={plan.value}>
          <RadioIndicator />
        </Radio>
        {plan.label}
      </label>
    {/each}
  </RadioGroup>
</Field>
