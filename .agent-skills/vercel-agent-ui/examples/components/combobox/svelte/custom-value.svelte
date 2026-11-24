<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemIndicator,
    ComboboxLabel,
    ComboboxList,
  } from "@ui-sdk/svelte/combobox"
  import { useLog } from "../../../shared/svelte/log"

  const titles = [
    "Designer",
    "Engineer",
    "Engineering manager",
    "Product manager",
    "Researcher",
  ]

  const log = useLog()
  let value = $state<string | null>(null)
</script>

<Combobox
  allowCustomValue
  bind:value
  onValueChange={(next, details) =>
    log(`${next ? `“${next}”` : "No title"} (${details.reason})`)}
>
  <div data-slot="stack">
    <ComboboxLabel>Job title</ComboboxLabel>
    <ComboboxInput placeholder="Type any title…" />
  </div>
  <ComboboxContent>
    <ComboboxEmpty>
      {#snippet children(state)}
        {#if state.empty}Press Enter to use “{state.query}”.{/if}
      {/snippet}
    </ComboboxEmpty>
    <ComboboxList>
      {#each titles as title (title)}
        <ComboboxItem value={title}>
          {title}
          <ComboboxItemIndicator>
            <CheckIcon aria-hidden="true" />
          </ComboboxItemIndicator>
        </ComboboxItem>
      {/each}
    </ComboboxList>
  </ComboboxContent>
</Combobox>
