<script setup lang="ts">
import { FolderIcon, SearchIcon, SettingsIcon } from "@lucide/vue"
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/vue/resizable"
</script>

<template>
  <Resizable>
    <ResizablePanel
      :default-size="30"
      :min-size="25"
      collapsible
      collapsed-size="48px"
    >
      <ul>
        <li data-slot="row">
          <FolderIcon aria-hidden="true" />
          <span>Files</span>
        </li>
        <li data-slot="row">
          <SearchIcon aria-hidden="true" />
          <span>Search</span>
        </li>
        <li data-slot="row">
          <SettingsIcon aria-hidden="true" />
          <span>Settings</span>
        </li>
      </ul>
    </ResizablePanel>
    <ResizableHandle aria-label="Resize sidebar">
      <div />
    </ResizableHandle>
    <ResizablePanel :min-size="40">
      <h3>README.md</h3>
      <span data-slot="hint">Edited by Inès Moreau</span>
    </ResizablePanel>
  </Resizable>
</template>
