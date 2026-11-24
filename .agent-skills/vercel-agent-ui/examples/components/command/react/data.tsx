"use client"

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
} from "@ui-sdk/react/command"
import { useLog } from "../../../shared/react/log"

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

function Example() {
  const log = useLog()
  return (
    <div data-slot="stack">
      <Command items={commands} onAction={(value) => log(`Ran ${value}`)}>
        <CommandInput
          aria-label="Search commands"
          placeholder="Type a command…"
        />
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandList>{(state) => <Commands items={state.items} />}</CommandList>
      </Command>
    </div>
  )
}

function Commands({ items }: { items: CommandData }) {
  return items.map((entry, index) => {
    if (typeof entry !== "string" && "type" in entry) {
      if (entry.type === "separator") {
        return <CommandSeparator key={`separator-${index}`} />
      }
      return (
        <CommandGroup key={entry.label}>
          <CommandGroupLabel>{entry.label}</CommandGroupLabel>
          <Commands items={entry.items} />
        </CommandGroup>
      )
    }
    const command: CommandDataItem =
      typeof entry === "string" ? { value: entry, label: entry } : entry
    return (
      <CommandItem
        key={command.value}
        value={command.value}
        label={command.label}
        disabled={command.disabled}
        shortcut={command.shortcut}
      >
        {command.label}
        {command.shortcut && <CommandShortcut />}
      </CommandItem>
    )
  })
}

export { Example }
