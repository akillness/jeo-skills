<script setup lang="ts">
import { Field, FieldControl, FieldLabel } from "@ui-sdk/vue/field"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuList,
  createTriggerMenuController,
} from "@ui-sdk/vue/trigger-menu"
import { useLog } from "../../../shared/vue/log"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

const log = useLog()
const menu = createTriggerMenuController()

async function mention() {
  const closed = await menu.open({ trigger: "@" })
  log(`Closed (${closed.reason})`)
}

function insertDate() {
  menu.insert(
    new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })
  )
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @mousedown.prevent @click="mention">Mention</button>
      <button type="button" @mousedown.prevent @click="insertDate">
        Insert Date
      </button>
    </div>
    <TriggerMenu :controller="menu" :triggers="[{ char: '@', items: people }]">
      <Field>
        <FieldLabel>Message</FieldLabel>
        <FieldControl>
          <template #render="{ props }">
            <TriggerMenuInput v-bind="props" placeholder="Write a message…" />
          </template>
        </FieldControl>
      </Field>
      <TriggerMenuContent>
        <TriggerMenuList v-slot="{ state }">
          <TriggerMenuItem
            v-for="item in state.items as TriggerMenuDataItem[]"
            :key="item.value"
            :value="item.value"
            :label="item.label"
          >
            {{ item.label }}
          </TriggerMenuItem>
        </TriggerMenuList>
      </TriggerMenuContent>
    </TriggerMenu>
  </div>
</template>
