<script lang="ts">
  import {
    Command,
    CommandInput,
    CommandItem,
    CommandList,
    CommandPage,
  } from "@ui-sdk/svelte/command"
  import { useLog } from "../../../shared/svelte/log"

  const themes = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ]

  const log = useLog()
  let value = $state<string | null>("dark")
  let query = $state("")
  let pages = $state(["theme"])
</script>

<Command
  bind:value
  bind:query
  bind:pages
  onValueChange={(next, details) =>
    log(`Highlighted ${next ?? "nothing"} (${details.reason})`)}
  onQueryChange={(next, details) => log(`Query “${next}” (${details.reason})`)}
  onPagesChange={(next, details) =>
    log(`Pages [${next.join(", ")}] (${details.reason})`)}
  onAction={(next) => log(`Ran ${next}`)}
>
  <CommandInput aria-label="Search themes" placeholder="Search themes…" />
  <CommandList>
    <CommandPage>
      <CommandItem value="theme" page="theme">Change theme…</CommandItem>
    </CommandPage>
    <CommandPage value="theme">
      {#each themes as theme (theme.value)}
        <CommandItem value={theme.value}>
          {theme.label}
        </CommandItem>
      {/each}
    </CommandPage>
  </CommandList>
</Command>
