<script lang="ts">
  import { FieldDescription, FieldLegend, FieldSet } from "@ui-sdk/svelte/field"
  import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/svelte/radio"

  const periods = [
    { value: "monthly", label: "Monthly", price: "$12 per month" },
    { value: "yearly", label: "Yearly", price: "$120 per year" },
  ]

  const id = $props.id()
</script>

<FieldSet>
  <FieldLegend id={`${id}-legend`}>Billing period</FieldLegend>
  <FieldDescription id={`${id}-description`}
    >Yearly billing gets you two months free.</FieldDescription
  >
  <RadioGroup
    defaultValue="monthly"
    aria-labelledby={`${id}-legend`}
    aria-describedby={`${id}-description`}
  >
    {#each periods as period (period.value)}
      <label data-slot="label">
        <Radio value={period.value}>
          <RadioIndicator />
        </Radio>
        {period.label}
        <span data-slot="hint">({period.price})</span>
      </label>
    {/each}
  </RadioGroup>
</FieldSet>
