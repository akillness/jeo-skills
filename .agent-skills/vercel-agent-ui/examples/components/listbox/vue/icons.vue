<script setup lang="ts">
import {
  ArchiveIcon,
  ArrowRightIcon,
  MailIcon,
  PencilIcon,
  StarIcon,
} from "@lucide/vue"
import { Listbox, ListboxItem, ListboxItemIcon } from "@ui-sdk/vue/listbox"

const views = [
  { value: "inbox", label: "Inbox", icon: MailIcon },
  { value: "starred", label: "Starred", icon: StarIcon },
  { value: "drafts", label: "Drafts", icon: PencilIcon },
  { value: "archive", label: "Archive", icon: ArchiveIcon },
  { value: "next", label: "Next page", icon: ArrowRightIcon },
]
</script>

<template>
  <Listbox default-value="inbox" aria-label="Mailbox">
    <ListboxItem v-for="view in views" :key="view.value" :value="view.value">
      <ListboxItemIcon :mirror="view.icon === ArrowRightIcon">
        <component :is="view.icon" />
      </ListboxItemIcon>
      {{ view.label }}
    </ListboxItem>
  </Listbox>
</template>
