<script lang="ts">
  import { CheckIcon, ChevronDownIcon, XIcon } from "@lucide/svelte"
  import {
    Combobox,
    ComboboxClear,
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

  const log = useLog()
  let value = $state<string | null>("sveltekit")
</script>

<Combobox
  bind:value
  onValueChange={(next, details) =>
    log(`${next ? frameworkLabel(next) : "Cleared"} (${details.reason})`)}
  itemToLabel={frameworkLabel}
>
  <div data-slot="stack">
    <ComboboxLabel>Framework</ComboboxLabel>
    <div data-slot="row">
      <ComboboxInput placeholder="Select a framework" />
      <ComboboxClear aria-label="Clear framework">
        <XIcon aria-hidden="true" />
      </ComboboxClear>
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
