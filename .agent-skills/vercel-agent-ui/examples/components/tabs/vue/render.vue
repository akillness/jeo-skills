<script setup lang="ts">
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/vue/tabs"

const folders = [
  {
    value: "inbox",
    label: "Inbox",
    count: 12,
    content: "12 conversations, 3 of them unread.",
  },
  {
    value: "unread",
    label: "Unread",
    count: 3,
    content: "Hollis Grant, Inès Moreau and Kofi Mensah wrote to you.",
  },
  {
    value: "archived",
    label: "Archived",
    count: 0,
    content: "Nothing archived yet. Archived mail stays searchable.",
  },
]
</script>

<template>
  <Tabs default-value="inbox">
    <TabsList aria-label="Mail">
      <TabsTab
        v-for="folder in folders"
        :key="folder.value"
        :value="folder.value"
      >
        <template #render="{ props, children }">
          <button v-bind="props">
            <component :is="children" />
            <span v-if="folder.count > 0" data-slot="badge">{{
              folder.count
            }}</span>
          </button>
        </template>
        {{ folder.label }}
      </TabsTab>
    </TabsList>
    <TabsPanel
      v-for="folder in folders"
      :key="folder.value"
      :value="folder.value"
    >
      {{ folder.content }}
    </TabsPanel>
  </Tabs>
</template>
