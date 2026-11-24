<script lang="ts">
  import {
    CalculatorIcon,
    CalendarIcon,
    CreditCardIcon,
    SearchIcon,
    SettingsIcon,
    SmileIcon,
    UserIcon,
  } from "@lucide/svelte"
  import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandGroupLabel,
    CommandInput,
    CommandItem,
    CommandItemIcon,
    CommandList,
  } from "@ui-sdk/svelte/command"
  import {
    Dialog,
    DialogBackdrop,
    DialogContent,
    DialogShortcut,
    DialogTitle,
    DialogTrigger,
  } from "@ui-sdk/svelte/dialog"
  import { useLog } from "../../../shared/svelte/log"

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

  const log = useLog()
  let open = $state(false)

  function onAction(value: string) {
    log(`Ran ${value}`)
    open = false
  }
</script>

<div data-slot="stack">
  <Dialog bind:open>
    <DialogTrigger shortcut="mod+k">
      Search…
      <DialogShortcut />
    </DialogTrigger>
    <DialogBackdrop />
    <DialogContent>
      <DialogTitle>Command palette</DialogTitle>
      <Command {onAction}>
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
            {#each commands as item (item.value)}
              <CommandItem value={item.value} disabled={item.disabled}>
                <CommandItemIcon>
                  <item.icon />
                </CommandItemIcon>
                {item.label}
              </CommandItem>
            {/each}
          </CommandGroup>
        </CommandList>
      </Command>
    </DialogContent>
  </Dialog>
</div>
