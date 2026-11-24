<script lang="ts">
  import { CheckIcon, ChevronDownIcon, SearchIcon } from "@lucide/svelte"
  import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemIndicator,
    ComboboxList,
    ComboboxTrigger,
    ComboboxValue,
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

  let button: HTMLButtonElement | undefined = $state()
  let query = $state("")
</script>

<Combobox
  bind:query
  defaultValue="jp"
  itemToLabel={countryLabel}
  onOpenChange={(open: boolean) => open && (query = "")}
  onOpenChangeComplete={(open: boolean) => !open && button?.focus()}
>
  <ComboboxTrigger aria-label="Country">
    {#snippet render({ props })}
      <button {...props} bind:this={button}>
        <span>
          <ComboboxValue>
            {#snippet children(state)}
              {state.label || "Select a country"}
            {/snippet}
          </ComboboxValue>
        </span>
        <ChevronDownIcon aria-hidden="true" />
      </button>
    {/snippet}
  </ComboboxTrigger>
  <ComboboxContent anchor={button}>
    <div data-slot="row">
      <SearchIcon aria-hidden="true" />
      <ComboboxInput
        autofocus
        aria-label="Search countries"
        placeholder="Search…"
      />
    </div>
    <ComboboxEmpty>No countries found.</ComboboxEmpty>
    <ComboboxList>
      {#each countries as country (country.value)}
        <ComboboxItem value={country.value} label={country.label}>
          {country.label}
          <ComboboxItemIndicator>
            <CheckIcon aria-hidden="true" />
          </ComboboxItemIndicator>
        </ComboboxItem>
      {/each}
    </ComboboxList>
  </ComboboxContent>
</Combobox>
