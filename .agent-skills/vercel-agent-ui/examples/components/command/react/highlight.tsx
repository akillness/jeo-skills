"use client"

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandItemIcon,
  CommandItemText,
  CommandList,
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

const commands = [
  { value: "calendar", label: "Calendar", icon: CalendarIcon },
  { value: "emoji", label: "Search Emoji", icon: SmileIcon },
  {
    value: "calculator",
    label: "Calculator",
    icon: CalculatorIcon,
    disabled: true,
  },
  { value: "profile", label: "Profile", icon: UserIcon },
  { value: "billing", label: "Billing", icon: CreditCardIcon },
  { value: "settings", label: "Settings", icon: SettingsIcon },
]

function Example() {
  return (
    <Command>
      <div data-slot="row">
        <SearchIcon aria-hidden="true" />
        <CommandInput
          aria-label="Search commands"
          placeholder="Try “prf” or “emo”…"
        />
      </div>
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandList>
        {commands.map((item) => (
          <CommandItem
            key={item.value}
            value={item.value}
            disabled={item.disabled}
          >
            <CommandItemIcon>
              <item.icon />
            </CommandItemIcon>
            <CommandItemText>{item.label}</CommandItemText>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  )
}

export { Example }
