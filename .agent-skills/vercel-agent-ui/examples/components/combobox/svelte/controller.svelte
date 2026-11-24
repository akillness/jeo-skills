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
    createComboboxController,
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

  const country = createComboboxController<string>()
  const log = useLog()

  async function openAndWait() {
    const { reason } = await country.open()
    log(`Closed by ${reason}, with ${country.getValue() ?? "nothing"}`)
  }

  function search() {
    country.focus()
    country.setQuery("sw")
    country.open()
  }
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={openAndWait}> Open and Wait </button>
    <button type="button" onclick={search}> Search “sw” </button>
    <button type="button" onclick={() => country.setValue("de")}>
      Choose Germany
    </button>
    <button type="button" onclick={() => country.clear()}> Clear </button>
  </div>
  <Combobox controller={country} itemToLabel={countryLabel}>
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
        {#each countries as item (item.value)}
          <ComboboxItem value={item.value} label={item.label}>
            {item.label}
            <ComboboxItemIndicator>
              <CheckIcon />
            </ComboboxItemIndicator>
          </ComboboxItem>
        {/each}
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
</div>
