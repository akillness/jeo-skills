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
    CommandInput,
    CommandItem,
    CommandItemIcon,
    CommandItemText,
    CommandList,
  } from "@ui-sdk/svelte/command"

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
</script>

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
    {#each commands as item (item.value)}
      <CommandItem value={item.value} disabled={item.disabled}>
        <CommandItemIcon>
          <item.icon />
        </CommandItemIcon>
        <CommandItemText>{item.label}</CommandItemText>
      </CommandItem>
    {/each}
  </CommandList>
</Command>
