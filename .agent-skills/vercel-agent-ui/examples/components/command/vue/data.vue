<script setup lang="ts">
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
} from "@ui-sdk/vue/command"
import { h, type FunctionalComponent } from "vue"
import { useLog } from "../../../shared/vue/log"

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

const Commands: FunctionalComponent<{ items: CommandData }> = ({ items }) =>
  items.map((entry, index) => {
    if (typeof entry !== "string" && "type" in entry) {
      if (entry.type === "separator") {
        return h(CommandSeparator, { key: `separator-${index}` })
      }
      return h(CommandGroup, { key: entry.label }, () => [
        h(CommandGroupLabel, () => entry.label),
        h(Commands, { items: entry.items }),
      ])
    }
    const command: CommandDataItem =
      typeof entry === "string" ? { value: entry, label: entry } : entry
    return h(
      CommandItem,
      {
        key: command.value,
        value: command.value,
        label: command.label,
        disabled: command.disabled,
        shortcut: command.shortcut,
      },
      () => [command.label, command.shortcut && h(CommandShortcut)]
    )
  })

const log = useLog()
</script>

<template>
  <div data-slot="stack">
    <Command :items="commands" @action="(value: string) => log(`Ran ${value}`)">
      <CommandInput
        aria-label="Search commands"
        placeholder="Type a command…"
      />
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandList v-slot="{ state }">
        <Commands :items="state.items" />
      </CommandList>
    </Command>
  </div>
</template>
