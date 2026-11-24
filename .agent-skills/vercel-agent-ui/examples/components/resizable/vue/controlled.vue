<script setup lang="ts">
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
  type ResizableLayoutChangeDetails,
} from "@ui-sdk/vue/resizable"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const format = (layout: number[]) => layout.map(Math.round).join(" / ")

const log = useLog()
const layout = ref([30, 70])

function onLayoutChange(next: number[], details: ResizableLayoutChangeDetails) {
  if (format(next) !== format(layout.value)) {
    log(`${format(next)} (${details.reason})`)
  }
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="layout = [50, 50]">Split Evenly</button>
      <button type="button" @click="layout = [30, 70]">Reset</button>
    </div>
    <Resizable v-model:layout="layout" @layout-change="onLayoutChange">
      <ResizablePanel :min-size="20">
        <h3>Files</h3>
        <ul>
          <li>page.tsx</li>
          <li>layout.tsx</li>
          <li>globals.css</li>
        </ul>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize files" />
      <ResizablePanel :min-size="20">
        <h3>page.tsx</h3>
        <span data-slot="hint">Saved just now</span>
      </ResizablePanel>
    </Resizable>
  </div>
</template>
