<script setup lang="ts">
import { CreditCardIcon, SettingsIcon, UserIcon } from "@lucide/vue"
import {
  Command,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandItemIcon,
  CommandList,
  CommandShortcut,
} from "@ui-sdk/vue/command"
import { useLog } from "../../../shared/vue/log"

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

const log = useLog()
</script>

<template>
  <div data-slot="stack">
    <Command @action="(value: string) => log(`Ran ${value}`)">
      <CommandInput
        aria-label="Search settings"
        placeholder="Search settings…"
      />
      <CommandList>
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
            <CommandShortcut v-slot="{ state }">{{
              state.text
            }}</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  </div>
</template>
