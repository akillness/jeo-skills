<script setup lang="ts">
import {
  createResizableController,
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/vue/resizable"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const editor = createResizableController()

function read() {
  log(
    `Layout ${editor.getLayout().map(Math.round).join(" / ")}${editor.isCollapsed("controller-sidebar") ? ", collapsed" : ""}`
  )
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="editor.collapse('controller-sidebar')">
        Collapse
      </button>
      <button type="button" @click="editor.expand('controller-sidebar')">
        Expand
      </button>
      <button
        type="button"
        @click="editor.resize('controller-sidebar', '240px')"
      >
        240px
      </button>
      <button type="button" @click="read">Read</button>
    </div>
    <Resizable :controller="editor">
      <ResizablePanel
        id="controller-sidebar"
        :default-size="30"
        :min-size="20"
        collapsible
      >
        <h3>Files</h3>
        <ul>
          <li>page.tsx</li>
          <li>layout.tsx</li>
          <li>globals.css</li>
        </ul>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize files" />
      <ResizablePanel :min-size="30">
        <h3>page.tsx</h3>
        <span data-slot="hint">Saved just now</span>
      </ResizablePanel>
    </Resizable>
  </div>
</template>
