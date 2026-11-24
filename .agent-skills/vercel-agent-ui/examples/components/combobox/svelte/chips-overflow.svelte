<script lang="ts">
  import { CheckIcon, XIcon } from "@lucide/svelte"
  import {
    Combobox,
    ComboboxChip,
    ComboboxChipRemove,
    ComboboxChips,
    ComboboxChipsOverflow,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemIndicator,
    ComboboxLabel,
    ComboboxList,
    ComboboxValue,
  } from "@ui-sdk/svelte/combobox"

  const countries = [
    { value: "ar", label: "Argentina", keywords: ["república argentina"] },
    { value: "au", label: "Australia", keywords: ["oz"] },
    { value: "at", label: "Austria", keywords: ["österreich"] },
    { value: "be", label: "Belgium", keywords: ["belgië", "belgique"] },
    { value: "br", label: "Brazil", keywords: ["brasil"] },
    { value: "ca", label: "Canada" },
    { value: "cl", label: "Chile" },
    { value: "dk", label: "Denmark", keywords: ["danmark"] },
    { value: "fi", label: "Finland", keywords: ["suomi"] },
    { value: "fr", label: "France" },
    { value: "de", label: "Germany", keywords: ["deutschland"] },
    { value: "gr", label: "Greece", keywords: ["hellas", "ελλάδα"] },
    { value: "jp", label: "Japan", keywords: ["nippon", "日本"] },
    { value: "nl", label: "Netherlands", keywords: ["holland", "nederland"] },
    { value: "es", label: "Spain", keywords: ["españa"] },
    { value: "se", label: "Sweden", keywords: ["sverige"] },
    {
      value: "ch",
      label: "Switzerland",
      keywords: ["schweiz", "suisse", "svizzera"],
    },
  ]

  const countryLabel = (value: string) =>
    countries.find((country) => country.value === value)?.label ?? value
</script>

<Combobox
  multiple
  defaultValue={["fr", "jp", "se", "de", "ch"]}
  itemToLabel={countryLabel}
>
  <div data-slot="stack">
    <ComboboxLabel>Countries</ComboboxLabel>
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
      <ComboboxChipsOverflow>
        {#snippet render({ props, state })}
          <span {...props} title={state.labels.join(", ")} data-slot="hint">
            +{state.count}
          </span>
        {/snippet}
      </ComboboxChipsOverflow>
      <ComboboxInput placeholder="Add…" />
    </ComboboxChips>
    <p data-slot="hint">
      <ComboboxValue
        maxLabels={2}
        getMoreLabel={(count: number) => `${count} more`}
      />
    </p>
  </div>
  <ComboboxContent>
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
