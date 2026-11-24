<script setup lang="ts">
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
} from "@lucide/vue"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@ui-sdk/vue/combobox"

const users = [
  { id: 1, name: "Hollis Grant", username: "hollis", role: "Owner" },
  { id: 2, name: "Inès Moreau", username: "ines", role: "Admin" },
  { id: 3, name: "Kofi Mensah", username: "kofi", role: "Member" },
  { id: 4, name: "Wren Takahashi", username: "wren", role: "Member" },
  { id: 5, name: "Tomasz Wójcik", username: "tomasz", role: "Guest" },
]
</script>

<template>
  <Combobox>
    <div data-slot="stack">
      <ComboboxLabel>Assignee</ComboboxLabel>
      <div data-slot="row">
        <ComboboxInput placeholder="Search people…">
          <template #render="{ props }">
            <div data-slot="row">
              <SearchIcon aria-hidden="true" />
              <input v-bind="props" />
            </div>
          </template>
        </ComboboxInput>
        <ComboboxTrigger v-slot="{ state }" aria-label="Show people">
          <ChevronUpIcon v-if="state.open" aria-hidden="true" />
          <ChevronDownIcon v-else aria-hidden="true" />
        </ComboboxTrigger>
      </div>
    </div>
    <ComboboxContent>
      <ComboboxEmpty>No one by that name.</ComboboxEmpty>
      <ComboboxList>
        <ComboboxItem
          v-for="user in users"
          :key="user.id"
          v-slot="{ state }"
          :value="user.username"
          :label="user.name"
          :keywords="[user.username]"
        >
          <span data-slot="badge">{{ user.name.slice(0, 1) }}</span>
          <span data-slot="stack">
            {{ user.name }}
            <span data-slot="hint">@{{ user.username }}</span>
          </span>
          <CheckIcon v-if="state.selected" aria-hidden="true" />
          <kbd v-else-if="state.highlighted" data-slot="kbd">Enter</kbd>
        </ComboboxItem>
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
</template>
