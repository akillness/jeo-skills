<script setup lang="ts">
import {
  CalculatorIcon,
  CalendarIcon,
  CreditCardIcon,
  SearchIcon,
  SettingsIcon,
  SmileIcon,
  UserIcon,
} from "@lucide/vue"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandItemIcon,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@ui-sdk/vue/command"

const suggestions = [
  { value: "calendar", label: "Calendar", icon: CalendarIcon },
  { value: "emoji", label: "Search Emoji", icon: SmileIcon },
  {
    value: "calculator",
    label: "Calculator",
    icon: CalculatorIcon,
    disabled: true,
  },
]

const settings = [
  { value: "profile", label: "Profile", icon: UserIcon, shortcut: "mod+p" },
  {
    value: "billing",
    label: "Billing",
    icon: CreditCardIcon,
    shortcut: "mod+b",
  },
  {
    value: "settings",
    label: "Settings",
    icon: SettingsIcon,
    shortcut: "mod+s",
  },
]
</script>

<template>
  <Command>
    <div data-slot="row">
      <SearchIcon aria-hidden="true" />
      <CommandInput
        aria-label="Search commands"
        placeholder="Type a command or search…"
      />
    </div>
    <CommandEmpty>No results found.</CommandEmpty>
    <CommandList>
      <CommandGroup>
        <CommandGroupLabel>Suggestions</CommandGroupLabel>
        <CommandItem
          v-for="item in suggestions"
          :key="item.value"
          :value="item.value"
          :disabled="item.disabled"
        >
          <CommandItemIcon>
            <component :is="item.icon" />
          </CommandItemIcon>
          <span>{{ item.label }}</span>
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup>
        <CommandGroupLabel>Settings</CommandGroupLabel>
        <CommandItem
          v-for="item in settings"
          :key="item.value"
          :value="item.value"
          :shortcut="item.shortcut"
        >
          <CommandItemIcon>
            <component :is="item.icon" />
          </CommandItemIcon>
          <span>{{ item.label }}</span>
          <CommandShortcut />
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
</template>
