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
} from "@ui-sdk/react/command"
import {
  Dialog,
  DialogBackdrop,
  DialogContent,
  DialogShortcut,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog"
import {
  CalculatorIcon,
  CalendarIcon,
  CreditCardIcon,
  SearchIcon,
  SettingsIcon,
  SmileIcon,
  UserIcon,
} from "lucide-react"
import { useLog } from "../../../shared/react/log"
import * as React from "react"

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
  const [open, setOpen] = React.useState(false)
  const log = useLog()
  return (
    <div data-slot="stack">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger shortcut="mod+k">
          Search…
          <DialogShortcut />
        </DialogTrigger>
        <DialogBackdrop />
        <DialogContent>
          <DialogTitle>Command palette</DialogTitle>
          <Command
            onAction={(value) => {
              log(`Ran ${value}`)
              setOpen(false)
            }}
          >
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
                {commands.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={item.value}
                    disabled={item.disabled}
                  >
                    <CommandItemIcon>
                      <item.icon />
                    </CommandItemIcon>
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { Example }
