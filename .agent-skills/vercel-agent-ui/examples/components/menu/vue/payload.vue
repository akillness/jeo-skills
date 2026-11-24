<script setup lang="ts">
import { EllipsisIcon } from "@lucide/vue"
import {
  createMenuController,
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@ui-sdk/vue/menu"
import { useLog } from "../../../shared/vue/log"

type File = { name: string; size: string }

const files: File[] = [
  { name: "Roadmap.pdf", size: "2.4 MB" },
  { name: "Budget.xlsx", size: "860 KB" },
  { name: "Team photo.jpg", size: "5.1 MB" },
]

const menu = createMenuController<File>()
const FileMenuContent = MenuContent<File>
const log = useLog()

async function openFirst(event: MouseEvent) {
  const result = await menu.open({
    payload: files[0],
    anchor: event.currentTarget as HTMLElement,
  })
  log(`Closed with ${result.reason}`)
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button @click="openFirst">Open {{ files[0].name }} Actions</button>
    </div>
    <ul data-slot="list">
      <li v-for="file in files" :key="file.name" data-slot="row">
        {{ file.name }}
        <span data-slot="hint">{{ file.size }}</span>
        <MenuTrigger
          :controller="menu"
          :payload="file"
          :aria-label="`Actions for ${file.name}`"
          data-variant="ghost"
          data-size="sm"
        >
          <EllipsisIcon aria-hidden="true" />
        </MenuTrigger>
      </li>
    </ul>
    <Menu
      :controller="menu"
      @action="(action) => log(`${action} ${menu.getPayload()?.name}`)"
    >
      <FileMenuContent v-slot="{ state }" align="end">
        <MenuGroup>
          <MenuGroupLabel>{{ state.payload?.name }}</MenuGroupLabel>
          <MenuItem value="open">Open</MenuItem>
          <MenuItem value="rename">Rename</MenuItem>
          <MenuItem value="duplicate">Duplicate</MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem value="delete">Delete</MenuItem>
      </FileMenuContent>
    </Menu>
  </div>
</template>
