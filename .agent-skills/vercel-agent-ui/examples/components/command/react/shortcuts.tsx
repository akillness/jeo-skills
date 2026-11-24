"use client"

import {
  Command,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandItemIcon,
  CommandList,
  CommandShortcut,
} from "@ui-sdk/react/command"
import { CreditCardIcon, SettingsIcon, UserIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

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
  const log = useLog()
  return (
    <div data-slot="stack">
      <Command onAction={(value) => log(`Ran ${value}`)}>
        <CommandInput
          aria-label="Search settings"
          placeholder="Search settings…"
        />
        <CommandList>
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
                <CommandShortcut>{(state) => state.text}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  )
}

export { Example }
