<script lang="ts">
  import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandGroupLabel,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
    type CommandData,
    type CommandDataItem,
  } from "@ui-sdk/svelte/command"
  import { useLog } from "../../../shared/svelte/log"

  const commands: CommandData = [
    {
      type: "group",
      label: "Navigation",
      items: [
        { value: "home", label: "Go home", keywords: ["start"] },
        { value: "inbox", label: "Open inbox", shortcut: "mod+i" },
      ],
    },
    { type: "separator" },
    {
      type: "group",
      label: "Preferences",
      items: [
        {
          value: "theme",
          label: "Change theme…",
          items: [
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" },
          ],
        },
        {
          value: "language",
          label: "Change language…",
          items: ["English", "Français", "Deutsch", "日本語"],
        },
        { value: "sign-out", label: "Sign out", shortcut: "mod+shift+q" },
      ],
    },
  ]

  const log = useLog()
</script>

{#snippet commandList(items: CommandData)}
  {#each items as entry, index (typeof entry === "string" ? entry : "type" in entry ? `${entry.type}-${index}` : entry.value)}
    {#if typeof entry !== "string" && "type" in entry}
      {#if entry.type === "separator"}
        <CommandSeparator />
      {:else}
        <CommandGroup>
          <CommandGroupLabel>{entry.label}</CommandGroupLabel>
          {@render commandList(entry.items)}
        </CommandGroup>
      {/if}
    {:else}
      {@render commandItem(
        typeof entry === "string" ? { value: entry, label: entry } : entry
      )}
    {/if}
  {/each}
{/snippet}

{#snippet commandItem(command: CommandDataItem)}
  <CommandItem
    value={command.value}
    label={command.label}
    disabled={command.disabled}
    shortcut={command.shortcut}
  >
    {command.label}
    {#if command.shortcut}<CommandShortcut />{/if}
  </CommandItem>
{/snippet}

<div data-slot="stack">
  <Command items={commands} onAction={(value) => log(`Ran ${value}`)}>
    <CommandInput aria-label="Search commands" placeholder="Type a command…" />
    <CommandEmpty>No results found.</CommandEmpty>
    <CommandList>
      {#snippet children(state)}
        {@render commandList(state.items)}
      {/snippet}
    </CommandList>
  </Command>
</div>
