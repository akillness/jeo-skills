"use client"

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
} from "@ui-sdk/react/command"
import {
  CalculatorIcon,
  CalendarIcon,
  CreditCardIcon,
  SearchIcon,
  SettingsIcon,
  SmileIcon,
  UserIcon,
} from "lucide-react"

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

function Example() {
  return (
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
          {suggestions.map((item) => (
            <CommandItem
              key={item.value}
              value={item.value}
              disabled={item.disabled}
            >
              <CommandItemIcon>
                <item.icon />
              </CommandItemIcon>
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup>
          <CommandGroupLabel>Settings</CommandGroupLabel>
          {settings.map((item) => (
            <CommandItem
              key={item.value}
              value={item.value}
              shortcut={item.shortcut}
            >
              <CommandItemIcon>
                <item.icon />
              </CommandItemIcon>
              <span>{item.label}</span>
              <CommandShortcut />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

export { Example }
