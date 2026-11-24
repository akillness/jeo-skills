<script setup lang="ts">
import { ArrowLeftIcon, MoonIcon, UsersIcon } from "@lucide/vue"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandItemIcon,
  CommandList,
  CommandPage,
  createCommandController,
} from "@ui-sdk/vue/command"
import { ref } from "vue"

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

const teams = [
  { value: "design", label: "Design" },
  { value: "engineering", label: "Engineering" },
  { value: "marketing", label: "Marketing" },
]

const command = createCommandController()
const pages = ref<string[]>([])

function onAction(value: string) {
  if (value === "back") {
    command.pop()
  }
}
</script>

<template>
  <Command v-model:pages="pages" :controller="command" @action="onAction">
    <div data-slot="row">
      <span v-for="page in pages" :key="page" data-slot="badge">{{
        page
      }}</span>
    </div>
    <CommandInput
      aria-label="Search commands"
      :placeholder="
        pages.length ? 'Search… (Backspace to go back)' : 'What do you need?'
      "
    />
    <CommandEmpty>No results found.</CommandEmpty>
    <CommandList>
      <CommandPage>
        <CommandGroup>
          <CommandGroupLabel>Workspace</CommandGroupLabel>
          <CommandItem value="theme" page="theme">
            <CommandItemIcon>
              <MoonIcon />
            </CommandItemIcon>
            Change theme…
          </CommandItem>
          <CommandItem value="teams" page="teams">
            <CommandItemIcon>
              <UsersIcon />
            </CommandItemIcon>
            Switch team…
          </CommandItem>
        </CommandGroup>
      </CommandPage>
      <CommandPage value="theme">
        <CommandItem
          v-for="theme in themes"
          :key="theme.value"
          :value="theme.value"
        >
          {{ theme.label }}
        </CommandItem>
      </CommandPage>
      <CommandPage value="teams">
        <CommandItem
          v-for="team in teams"
          :key="team.value"
          :value="team.value"
        >
          {{ team.label }}
        </CommandItem>
      </CommandPage>
      <CommandItem v-if="pages.length > 0" value="back">
        <CommandItemIcon mirror>
          <ArrowLeftIcon />
        </CommandItemIcon>
        Go back
      </CommandItem>
    </CommandList>
  </Command>
</template>
