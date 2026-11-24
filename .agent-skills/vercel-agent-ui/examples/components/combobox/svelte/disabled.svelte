<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemIndicator,
    ComboboxLabel,
    ComboboxList,
    ComboboxTrigger,
  } from "@ui-sdk/svelte/combobox"

  const countries = [
    { value: "ar", label: "Argentina" },
    { value: "au", label: "Australia" },
    { value: "at", label: "Austria" },
    { value: "be", label: "Belgium" },
    { value: "br", label: "Brazil" },
    { value: "ca", label: "Canada" },
    { value: "cl", label: "Chile" },
    { value: "dk", label: "Denmark" },
    { value: "fi", label: "Finland" },
    { value: "fr", label: "France" },
    { value: "de", label: "Germany" },
    { value: "gr", label: "Greece" },
    { value: "jp", label: "Japan" },
    { value: "nl", label: "Netherlands" },
    { value: "es", label: "Spain" },
    { value: "se", label: "Sweden" },
    { value: "ch", label: "Switzerland" },
  ]

  const countryLabel = (value: string) =>
    countries.find((country) => country.value === value)?.label ?? value

  const variants = ["disabled", "readOnly", "item"] as const
</script>

<div data-slot="stack">
  {#each variants as variant (variant)}
    <Combobox
      defaultValue={variant === "item" ? null : "fr"}
      itemToLabel={countryLabel}
      disabled={variant === "disabled"}
      readOnly={variant === "readOnly"}
    >
      <div data-slot="stack">
        <ComboboxLabel>
          {variant === "disabled"
            ? "Billing country"
            : variant === "readOnly"
              ? "Shipping from"
              : "Shipping to"}
        </ComboboxLabel>
        <div data-slot="row">
          <ComboboxInput placeholder="Search countries…" />
          <ComboboxTrigger aria-label="Show countries">
            <ChevronDownIcon aria-hidden="true" />
          </ComboboxTrigger>
        </div>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>No countries found.</ComboboxEmpty>
        <ComboboxList>
          {#each countries as country (country.value)}
            <ComboboxItem
              value={country.value}
              label={country.label}
              disabled={country.value === "dk"}
            >
              {country.label}
              <ComboboxItemIndicator>
                <CheckIcon aria-hidden="true" />
              </ComboboxItemIndicator>
            </ComboboxItem>
          {/each}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  {/each}
</div>
