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
  import { useLog } from "../../../shared/svelte/log"

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

  let value = $state<string | null>("fr")
  let query = $state("France")
  let open = $state(false)
  const log = useLog()
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => (value = "jp")}> Choose Japan </button>
    <button type="button" onclick={() => (open = true)}> Open </button>
  </div>
  <Combobox
    bind:value
    bind:query
    bind:open
    itemToLabel={countryLabel}
    debug
    onValueChange={(next, details) => log(`value: ${next} (${details.reason})`)}
    onQueryChange={(next, details) =>
      log(`query: “${next}” (${details.reason})`)}
    onOpenChange={(next, details) => log(`open: ${next} (${details.reason})`)}
  >
    <div data-slot="stack">
      <ComboboxLabel>Country</ComboboxLabel>
      <div data-slot="row">
        <ComboboxInput placeholder="Search countries…" />
        <ComboboxTrigger aria-label="Show countries">
          <ChevronDownIcon />
        </ComboboxTrigger>
      </div>
    </div>
    <ComboboxContent>
      <ComboboxEmpty>No countries found.</ComboboxEmpty>
      <ComboboxList>
        {#each countries as country (country.value)}
          <ComboboxItem value={country.value} label={country.label}>
            {country.label}
            <ComboboxItemIndicator>
              <CheckIcon />
            </ComboboxItemIndicator>
          </ComboboxItem>
        {/each}
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
</div>
