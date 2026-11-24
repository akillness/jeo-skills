<script lang="ts">
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/svelte/radio"

  const frequencies = [
    {
      value: "instant",
      label: "Instantly",
      description: "An email right away.",
    },
    {
      value: "daily",
      label: "Daily digest",
      description: "One email each morning.",
    },
    {
      value: "weekly",
      label: "Weekly digest",
      description: "A summary every Monday.",
    },
  ]
</script>

<Field>
  <FieldLabel>Email notifications</FieldLabel>
  <RadioGroup defaultValue="daily">
    {#each frequencies as frequency (frequency.value)}
      <Field>
        <Radio value={frequency.value}>
          <RadioIndicator />
        </Radio>
        <div data-slot="stack">
          <FieldLabel>{frequency.label}</FieldLabel>
          <FieldDescription>{frequency.description}</FieldDescription>
        </div>
      </Field>
    {/each}
  </RadioGroup>
</Field>
