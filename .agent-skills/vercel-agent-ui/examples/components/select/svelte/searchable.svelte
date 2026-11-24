<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Select,
    SelectContent,
    SelectEmpty,
    SelectGroup,
    SelectGroupLabel,
    SelectInput,
    SelectItem,
    SelectItemIndicator,
    SelectItemText,
    SelectList,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"

  const countries = [
    { value: "ar", label: "Argentina", code: "+54" },
    { value: "au", label: "Australia", code: "+61" },
    { value: "at", label: "Austria", code: "+43" },
    { value: "be", label: "Belgium", code: "+32" },
    { value: "br", label: "Brazil", code: "+55" },
    { value: "ca", label: "Canada", code: "+1" },
    { value: "cl", label: "Chile", code: "+56" },
    { value: "cn", label: "China", code: "+86" },
    { value: "dk", label: "Denmark", code: "+45" },
    { value: "fi", label: "Finland", code: "+358" },
    { value: "fr", label: "France", code: "+33" },
    { value: "de", label: "Germany", code: "+49" },
    { value: "gr", label: "Greece", code: "+30" },
    { value: "in", label: "India", code: "+91" },
    { value: "ie", label: "Ireland", code: "+353" },
    { value: "it", label: "Italy", code: "+39" },
    { value: "jp", label: "Japan", code: "+81" },
    { value: "mx", label: "Mexico", code: "+52" },
    { value: "nl", label: "Netherlands", code: "+31" },
    { value: "no", label: "Norway", code: "+47" },
    { value: "pt", label: "Portugal", code: "+351" },
    { value: "es", label: "Spain", code: "+34" },
    { value: "se", label: "Sweden", code: "+46" },
    { value: "ch", label: "Switzerland", code: "+41" },
  ]

  const popularCountries = [
    {
      type: "group" as const,
      label: "Popular",
      items: [countries[5], countries[11], countries[16]],
    },
  ]
</script>

<Field>
  <FieldLabel>Country</FieldLabel>
  <Select
    items={countries}
    emptyItems={popularCountries}
    placeholder="Select a country"
    filter="contains"
    announcement={(change) =>
      change.type === "results"
        ? `${change.count} ${change.count === 1 ? "country" : "countries"} found`
        : null}
  >
    <SelectTrigger>
      <SelectValue />
      <ChevronDownIcon />
    </SelectTrigger>
    <SelectContent>
      <SelectInput
        aria-label="Search countries"
        placeholder="Search countries…"
      />
      <SelectEmpty>No countries found.</SelectEmpty>
      <SelectList>
        {#snippet children(state)}
          {#snippet countryItem(country: { value: string; label: string })}
            <SelectItem value={country.value} label={country.label}>
              <SelectItemText />
              <SelectItemIndicator>
                <CheckIcon />
              </SelectItemIndicator>
            </SelectItem>
          {/snippet}
          {#each state.items as ((typeof countries)[number] | (typeof popularCountries)[number])[] as entry ("items" in entry ? entry.label : entry.value)}
            {#if "items" in entry}
              <SelectGroup>
                <SelectGroupLabel>{entry.label}</SelectGroupLabel>
                {#each entry.items as country (country.value)}
                  {@render countryItem(country)}
                {/each}
              </SelectGroup>
            {:else}
              {@render countryItem(entry)}
            {/if}
          {/each}
        {/snippet}
      </SelectList>
    </SelectContent>
  </Select>
</Field>
