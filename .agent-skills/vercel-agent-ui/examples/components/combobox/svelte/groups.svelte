<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxGroup,
    ComboboxGroupLabel,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemIndicator,
    ComboboxLabel,
    ComboboxList,
    ComboboxSeparator,
    ComboboxTrigger,
  } from "@ui-sdk/svelte/combobox"

  const timezones = [
    {
      label: "Americas",
      items: [
        { value: "America/New_York", label: "New York" },
        { value: "America/Chicago", label: "Chicago" },
        { value: "America/Denver", label: "Denver" },
        { value: "America/Los_Angeles", label: "Los Angeles" },
        { value: "America/Sao_Paulo", label: "São Paulo" },
      ],
    },
    {
      label: "Europe",
      items: [
        { value: "Europe/London", label: "London" },
        { value: "Europe/Paris", label: "Paris" },
        { value: "Europe/Berlin", label: "Berlin" },
        { value: "Europe/Madrid", label: "Madrid" },
      ],
    },
    {
      label: "Asia & Pacific",
      items: [
        { value: "Asia/Tokyo", label: "Tokyo" },
        { value: "Asia/Singapore", label: "Singapore" },
        { value: "Asia/Kolkata", label: "Kolkata" },
        { value: "Australia/Sydney", label: "Sydney" },
      ],
    },
  ]
</script>

<Combobox>
  <div data-slot="stack">
    <ComboboxLabel>Timezone</ComboboxLabel>
    <div data-slot="row">
      <ComboboxInput placeholder="Search cities…" />
      <ComboboxTrigger aria-label="Show timezones">
        <ChevronDownIcon aria-hidden="true" />
      </ComboboxTrigger>
    </div>
  </div>
  <ComboboxContent>
    <ComboboxEmpty>No cities found.</ComboboxEmpty>
    <ComboboxList>
      {#each timezones as group, index (group.label)}
        {#if index > 0}<ComboboxSeparator />{/if}
        <ComboboxGroup>
          <ComboboxGroupLabel>
            {group.label}
          </ComboboxGroupLabel>
          {#each group.items as item (item.value)}
            <ComboboxItem value={item.value} label={item.label}>
              {item.label}
              <ComboboxItemIndicator>
                <CheckIcon aria-hidden="true" />
              </ComboboxItemIndicator>
            </ComboboxItem>
          {/each}
        </ComboboxGroup>
      {/each}
    </ComboboxList>
  </ComboboxContent>
</Combobox>
