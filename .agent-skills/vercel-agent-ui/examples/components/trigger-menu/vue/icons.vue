<script setup lang="ts">
import {
  ClockIcon,
  ReplyIcon,
  SearchIcon,
  ShareIcon,
  TrashIcon,
} from "@lucide/vue"
import { Field, FieldControl, FieldLabel } from "@ui-sdk/vue/field"
import {
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuItemIcon,
  TriggerMenuList,
} from "@ui-sdk/vue/trigger-menu"

const commands = [
  { value: "reply", icon: ReplyIcon, mirror: true },
  { value: "remind", icon: ClockIcon },
  { value: "search", icon: SearchIcon },
  { value: "share", icon: ShareIcon },
  { value: "clear", icon: TrashIcon },
]
</script>

<template>
  <TriggerMenu :triggers="[{ char: '/', boundary: 'start', type: 'command' }]">
    <Field>
      <FieldLabel>Message</FieldLabel>
      <FieldControl>
        <template #render="{ props }">
          <TriggerMenuInput v-bind="props" placeholder="Type / for commands…" />
        </template>
      </FieldControl>
    </Field>
    <TriggerMenuContent>
      <TriggerMenuList>
        <TriggerMenuItem
          v-for="command in commands"
          :key="command.value"
          :value="command.value"
        >
          <TriggerMenuItemIcon :mirror="command.mirror">
            <component :is="command.icon" />
          </TriggerMenuItemIcon>
          {{ command.value }}
        </TriggerMenuItem>
      </TriggerMenuList>
    </TriggerMenuContent>
  </TriggerMenu>
</template>
