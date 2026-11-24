import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandItemIcon,
  CommandList,
} from "@ui-sdk/solid/command"
import {
  Dialog,
  DialogBackdrop,
  DialogContent,
  DialogShortcut,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/solid/dialog"
import { createSignal, For } from "solid-js"
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
const Calendar = icon(
  '<path d="M8 2v3" /><path d="M16 2v3" /><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" />'
)
const Smile = icon(
  '<path d="M15 10V9" /><path d="M16.472 15a6 6 0 01-8.943 0" /><path d="M9 10V9" /><circle cx="12" cy="12" r="10" />'
)
const Calculator = icon(
  '<rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M16 10h.01" /><path d="M12 10h.01" /><path d="M8 10h.01" /><path d="M12 14h.01" /><path d="M8 14h.01" /><path d="M12 18h.01" /><path d="M8 18h.01" />'
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
const Search = icon(
  '<path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" />'
)

const commands = [
  { value: "calendar", label: "Calendar", icon: Calendar },
  { value: "emoji", label: "Search Emoji", icon: Smile },
  {
    value: "calculator",
    label: "Calculator",
    icon: Calculator,
    disabled: true,
  },
  { value: "profile", label: "Profile", icon: User },
  { value: "billing", label: "Billing", icon: CreditCard },
  { value: "settings", label: "Settings", icon: Settings },
]

function Example() {
  const [open, setOpen] = createSignal(false)
  const log = useLog()
  return (
    <div data-slot="stack">
      <Dialog open={open()} onOpenChange={(next) => setOpen(next)}>
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
              <Search aria-hidden="true" />
              <CommandInput
                aria-label="Search commands"
                placeholder="Type a command or search…"
              />
            </div>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandList>
              <CommandGroup>
                <CommandGroupLabel>Suggestions</CommandGroupLabel>
                <For each={commands}>
                  {(item) => (
                    <CommandItem value={item.value} disabled={item.disabled}>
                      <CommandItemIcon>
                        <item.icon />
                      </CommandItemIcon>
                      {item.label}
                    </CommandItem>
                  )}
                </For>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { Example }
