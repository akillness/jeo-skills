<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"

  const countries = [
    { value: "ca", label: "Canada" },
    { value: "dk", label: "Denmark" },
    { value: "fr", label: "France" },
    { value: "de", label: "Germany" },
    { value: "jp", label: "Japan" },
    { value: "es", label: "Spain" },
  ]

  const fields = [
    { label: "Billing country", disabled: true },
    { label: "Shipping from", readOnly: true },
    { label: "Shipping to" },
  ]
</script>

<div data-slot="stack">
  {#each fields as field (field.label)}
    <Field>
      <FieldLabel>{field.label}</FieldLabel>
      <Select
        defaultValue={field.disabled || field.readOnly ? "fr" : null}
        placeholder="Select a country"
        disabled={field.disabled}
        readOnly={field.readOnly}
      >
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          {#each countries as country (country.value)}
            <SelectItem value={country.value} disabled={country.value === "dk"}>
              {country.label}
              <SelectItemIndicator>
                <CheckIcon />
              </SelectItemIndicator>
            </SelectItem>
          {/each}
        </SelectContent>
      </Select>
    </Field>
  {/each}
</div>
