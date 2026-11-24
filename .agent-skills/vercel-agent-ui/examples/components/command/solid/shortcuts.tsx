import {
  Command,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandItemIcon,
  CommandList,
  CommandShortcut,
} from "@ui-sdk/solid/command"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const icon = (markup: string) => () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    innerHTML={markup}
  />
)
const User = icon(
  '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />'
)
const CreditCard = icon(
  '<rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /><path d="M6 14h2" />'
)
const Settings = icon(
  '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" />'
)

const settings = [
  { value: "profile", label: "Profile", icon: User, shortcut: "mod+p" },
  { value: "billing", label: "Billing", icon: CreditCard, shortcut: "mod+b" },
  { value: "settings", label: "Settings", icon: Settings, shortcut: "mod+s" },
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
            <For each={settings}>
              {(item) => (
                <CommandItem value={item.value} shortcut={item.shortcut}>
                  <CommandItemIcon>
                    <item.icon />
                  </CommandItemIcon>
                  <span>{item.label}</span>
                  <CommandShortcut>{(state) => state.text}</CommandShortcut>
                </CommandItem>
              )}
            </For>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  )
}

export { Example }
