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
} from "@ui-sdk/vue/command"
import {
  Dialog,
  DialogBackdrop,
  DialogContent,
  DialogShortcut,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/vue/dialog"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

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

const open = ref(false)
const log = useLog()

function onAction(value: string) {
  log(`Ran ${value}`)
  open.value = false
}
</script>

<template>
  <div data-slot="stack">
    <Dialog v-model:open="open">
      <DialogTrigger shortcut="mod+k">
        Search…
        <DialogShortcut />
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent>
        <DialogTitle>Command palette</DialogTitle>
        <Command @action="onAction">
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
                v-for="item in commands"
                :key="item.value"
                :value="item.value"
                :disabled="item.disabled"
              >
                <CommandItemIcon>
                  <component :is="item.icon" />
                </CommandItemIcon>
                {{ item.label }}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  </div>
</template>
