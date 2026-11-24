<script lang="ts">
  import { CheckIcon, MinusIcon, XIcon } from "@lucide/svelte"
  import {
    Combobox,
    ComboboxChip,
    ComboboxChipRemove,
    ComboboxChips,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxGroup,
    ComboboxGroupLabel,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemIndicator,
    ComboboxLabel,
    ComboboxList,
    ComboboxSelectAll,
    ComboboxValue,
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

<Combobox multiple defaultValue={["Europe/Paris"]}>
  <div data-slot="stack">
    <ComboboxLabel>Timezones</ComboboxLabel>
    <ComboboxChips>
      <ComboboxValue>
        {#snippet children(state)}
          {#each state.value as string[] as value, index (value)}
            <ComboboxChip {value}>
              {state.labels[index]}
              <ComboboxChipRemove aria-label={`Remove ${state.labels[index]}`}>
                <XIcon aria-hidden="true" />
              </ComboboxChipRemove>
            </ComboboxChip>
          {/each}
        {/snippet}
      </ComboboxValue>
      <ComboboxInput placeholder="Add timezones…" />
    </ComboboxChips>
  </div>
  <ComboboxContent>
    <ComboboxEmpty>No timezones found.</ComboboxEmpty>
    <ComboboxList>
      <ComboboxSelectAll>
        <span>
          <CheckIcon aria-hidden="true" />
          <MinusIcon aria-hidden="true" />
        </span>
        Select all
      </ComboboxSelectAll>
      {#each timezones as group (group.label)}
        <ComboboxGroup>
          <ComboboxGroupLabel>
            {group.label}
          </ComboboxGroupLabel>
          <ComboboxSelectAll>
            {#snippet children(state)}
              {state.checked
                ? `Clear ${group.label}`
                : `Select all in ${group.label}`}
            {/snippet}
          </ComboboxSelectAll>
          {#each group.items as zone (zone.value)}
            <ComboboxItem value={zone.value} label={zone.label}>
              <span>
                <ComboboxItemIndicator>
                  <CheckIcon aria-hidden="true" />
                </ComboboxItemIndicator>
              </span>
              {zone.label}
            </ComboboxItem>
          {/each}
        </ComboboxGroup>
      {/each}
    </ComboboxList>
  </ComboboxContent>
</Combobox>
