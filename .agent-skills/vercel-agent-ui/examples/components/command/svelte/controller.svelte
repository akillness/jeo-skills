<script lang="ts">
  import {
    Command,
    CommandInput,
    CommandItem,
    CommandList,
    CommandPage,
    createCommandController,
  } from "@ui-sdk/svelte/command"
  import { useLog } from "../../../shared/svelte/log"

  const themes = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ]

  const palette = createCommandController()
  const log = useLog()
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => palette.push("theme")}>
      Open Themes
    </button>
    <button type="button" onclick={() => palette.pop()}> Back </button>
    <button type="button" onclick={() => palette.setValue("dark")}>
      Highlight Dark
    </button>
    <button type="button" onclick={() => palette.setQuery("li")}>
      Search “li”
    </button>
    <button type="button" onclick={() => palette.run()}>
      Run Highlighted
    </button>
    <button type="button" onclick={() => palette.focus()}> Focus </button>
  </div>
  <Command controller={palette} onAction={(value) => log(`Ran ${value}`)}>
    <CommandInput aria-label="Search commands" />
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
</div>
