<script setup lang="ts">
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  LinkIcon,
  MailIcon,
  ShareIcon,
  TrashIcon,
} from "@lucide/vue"
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@ui-sdk/vue/menu"
import { ref } from "vue"

const action = ref("")
</script>

<template>
  <div dir="rtl" data-slot="stack">
    <Menu @action="(value: string) => (action = value)">
      <MenuTrigger>ملف</MenuTrigger>
      <MenuContent>
        <MenuItem value="new" shortcut="mod+n">
          <FileIcon />
          جديد
        </MenuItem>
        <MenuItem value="open" shortcut="mod+o">
          <FolderIcon />
          فتح…
        </MenuItem>
        <MenuSeparator />
        <MenuSub>
          <MenuSubTrigger>
            <ShareIcon />
            مشاركة
            <ChevronRightIcon />
          </MenuSubTrigger>
          <MenuSubContent>
            <MenuItem value="email">
              <MailIcon />
              البريد الإلكتروني
            </MenuItem>
            <MenuItem value="copy-link">
              <LinkIcon />
              نسخ الرابط
            </MenuItem>
          </MenuSubContent>
        </MenuSub>
        <MenuSeparator />
        <MenuItem value="delete">
          <TrashIcon />
          حذف
        </MenuItem>
      </MenuContent>
    </Menu>
    <output data-slot="output">{{
      action ? `نُفّذ: ${action}` : "اختر عنصرًا"
    }}</output>
  </div>
</template>
