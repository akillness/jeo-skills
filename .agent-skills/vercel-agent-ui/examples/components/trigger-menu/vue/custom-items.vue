<script setup lang="ts">
import { UsersIcon } from "@lucide/vue"
import { Field, FieldControl, FieldLabel } from "@ui-sdk/vue/field"
import {
  type TriggerDefinition,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuGroup,
  TriggerMenuGroupLabel,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuItemIcon,
  TriggerMenuList,
  TriggerMenuSeparator,
} from "@ui-sdk/vue/trigger-menu"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik", disabled: true },
]

const triggers: TriggerDefinition[] = [
  {
    char: "@",
    spaces: 2,
    maxLength: 30,
    pattern: /[\p{L}.'-]/u,
    filter: "startsWith",
    insert: (item) => `@${item.label.split(" ")[0]} `,
  },
]
</script>

<template>
  <TriggerMenu :triggers="triggers">
    <Field>
      <FieldLabel>Message</FieldLabel>
      <FieldControl>
        <template #render="{ props }">
          <TriggerMenuInput
            v-bind="props"
            placeholder="Type @ and a first name…"
          />
        </template>
      </FieldControl>
    </Field>
    <TriggerMenuContent>
      <TriggerMenuList>
        <TriggerMenuGroup>
          <TriggerMenuGroupLabel>People</TriggerMenuGroupLabel>
          <TriggerMenuItem
            v-for="person in people"
            :key="person.value"
            :value="person.value"
            :label="person.label"
            :disabled="person.disabled"
          >
            {{ person.label }}
            <span data-slot="hint">{{
              person.disabled ? "Deactivated" : `@${person.value}`
            }}</span>
          </TriggerMenuItem>
        </TriggerMenuGroup>
        <TriggerMenuSeparator />
        <TriggerMenuItem
          value="here"
          label="here"
          :keywords="['everyone', 'channel']"
          @select="(value, details) => details.insert('@here ')"
        >
          <TriggerMenuItemIcon>
            <UsersIcon />
          </TriggerMenuItemIcon>
          Notify everyone here
        </TriggerMenuItem>
      </TriggerMenuList>
    </TriggerMenuContent>
  </TriggerMenu>
</template>
