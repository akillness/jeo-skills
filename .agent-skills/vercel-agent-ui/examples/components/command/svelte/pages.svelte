<script lang="ts">
  import { ArrowLeftIcon, MoonIcon, UsersIcon } from "@lucide/svelte"
  import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandGroupLabel,
    CommandInput,
    CommandItem,
    CommandItemIcon,
    CommandList,
    CommandPage,
    createCommandController,
  } from "@ui-sdk/svelte/command"

  const themes = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ]

  const teams = [
    { value: "design", label: "Design" },
    { value: "engineering", label: "Engineering" },
    { value: "marketing", label: "Marketing" },
  ]

  const command = createCommandController()
  let pages = $state<string[]>([])

  function onAction(value: string) {
    if (value === "back") {
      command.pop()
    }
  }
</script>

<Command bind:pages controller={command} {onAction}>
  <div data-slot="row">
    {#each pages as page (page)}
      <span data-slot="badge">{page}</span>
    {/each}
  </div>
  <CommandInput
    aria-label="Search commands"
    placeholder={pages.length
      ? "Search… (Backspace to go back)"
      : "What do you need?"}
  />
  <CommandEmpty>No results found.</CommandEmpty>
  <CommandList>
    <CommandPage>
      <CommandGroup>
        <CommandGroupLabel>Workspace</CommandGroupLabel>
        <CommandItem value="theme" page="theme">
          <CommandItemIcon>
            <MoonIcon />
          </CommandItemIcon>
          Change theme…
        </CommandItem>
        <CommandItem value="teams" page="teams">
          <CommandItemIcon>
            <UsersIcon />
          </CommandItemIcon>
          Switch team…
        </CommandItem>
      </CommandGroup>
    </CommandPage>
    <CommandPage value="theme">
      {#each themes as theme (theme.value)}
        <CommandItem value={theme.value}>
          {theme.label}
        </CommandItem>
      {/each}
    </CommandPage>
    <CommandPage value="teams">
      {#each teams as team (team.value)}
        <CommandItem value={team.value}>
          {team.label}
        </CommandItem>
      {/each}
    </CommandPage>
    {#if pages.length > 0}
      <CommandItem value="back">
        <CommandItemIcon mirror>
          <ArrowLeftIcon />
        </CommandItemIcon>
        Go back
      </CommandItem>
    {/if}
  </CommandList>
</Command>
