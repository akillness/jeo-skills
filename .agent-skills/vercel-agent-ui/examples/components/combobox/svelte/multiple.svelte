<script lang="ts">
  import { CheckIcon, ChevronDownIcon, XIcon } from "@lucide/svelte"
  import {
    Combobox,
    ComboboxChip,
    ComboboxChipRemove,
    ComboboxChips,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemIndicator,
    ComboboxLabel,
    ComboboxList,
    ComboboxTrigger,
    ComboboxValue,
  } from "@ui-sdk/svelte/combobox"

  const frameworks = [
    { value: "next", label: "Next.js" },
    { value: "sveltekit", label: "SvelteKit" },
    { value: "nuxt", label: "Nuxt" },
    { value: "remix", label: "Remix" },
    { value: "astro", label: "Astro" },
    { value: "solidstart", label: "SolidStart" },
    { value: "qwik", label: "Qwik City" },
  ]

  const frameworkLabel = (value: string) =>
    frameworks.find((framework) => framework.value === value)?.label ?? value
</script>

<Combobox
  multiple
  defaultValue={["next", "astro"]}
  itemToLabel={frameworkLabel}
>
  <div data-slot="stack">
    <ComboboxLabel>Frameworks</ComboboxLabel>
    <div data-slot="row">
      <ComboboxChips>
        <ComboboxValue>
          {#snippet children(state)}
            {#each state.value as string[] as value, index (value)}
              <ComboboxChip {value}>
                {state.labels[index]}
                <ComboboxChipRemove
                  aria-label={`Remove ${state.labels[index]}`}
                >
                  <XIcon aria-hidden="true" />
                </ComboboxChipRemove>
              </ComboboxChip>
            {/each}
          {/snippet}
        </ComboboxValue>
        <ComboboxInput placeholder="Add a framework…" />
      </ComboboxChips>
      <ComboboxTrigger aria-label="Show frameworks">
        <ChevronDownIcon aria-hidden="true" />
      </ComboboxTrigger>
    </div>
  </div>
  <ComboboxContent>
    <ComboboxEmpty>No frameworks found.</ComboboxEmpty>
    <ComboboxList>
      {#each frameworks as framework (framework.value)}
        <ComboboxItem value={framework.value} label={framework.label}>
          {framework.label}
          <ComboboxItemIndicator>
            <CheckIcon aria-hidden="true" />
          </ComboboxItemIndicator>
        </ComboboxItem>
      {/each}
    </ComboboxList>
  </ComboboxContent>
</Combobox>
