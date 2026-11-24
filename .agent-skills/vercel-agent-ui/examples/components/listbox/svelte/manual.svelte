<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import {
    Listbox,
    ListboxItem,
    ListboxItemIndicator,
  } from "@ui-sdk/svelte/listbox"
  import { useLog } from "../../../shared/svelte/log"

  const frameworks = [
    { value: "next", label: "Next.js" },
    { value: "remix", label: "Remix" },
    { value: "astro", label: "Astro" },
    { value: "nuxt", label: "Nuxt" },
    { value: "sveltekit", label: "SvelteKit" },
  ]

  const log = useLog()
</script>

<Listbox
  activation="manual"
  onValueChange={(value, details) =>
    log(`${value ?? "Nothing"} (${details.reason})`)}
  aria-label="Framework"
>
  {#each frameworks as framework (framework.value)}
    <ListboxItem value={framework.value}>
      {framework.label}
      <ListboxItemIndicator>
        <CheckIcon aria-hidden="true" />
      </ListboxItemIndicator>
    </ListboxItem>
  {/each}
</Listbox>
