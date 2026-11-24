<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue"
import {
  Tree,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  visibleTreeRows,
  type ListHighlightDetails,
  type TreeItemData,
} from "@ui-sdk/vue/tree"
import { computed, ref } from "vue"

const items: TreeItemData[] = Array.from({ length: 100 }, (_, folder) => ({
  value: `folder-${folder + 1}`,
  label: `Folder ${folder + 1}`,
  children: Array.from({ length: 100 }, (_, file) => ({
    value: `folder-${folder + 1}/file-${file + 1}`,
    label: `File ${file + 1}.txt`,
  })),
}))

const row = 32
const height = 288

const scroller = ref<HTMLDivElement | null>(null)
const scrollTop = ref(0)
const expanded = ref(["folder-1"])
const rows = computed(() => visibleTreeRows(items, expanded.value))
const visible = computed(() => {
  const start = Math.max(0, Math.floor(scrollTop.value / row) - 4)
  const end = Math.min(
    rows.value.length,
    Math.ceil((scrollTop.value + height) / row) + 4
  )
  return rows.value.slice(start, end)
})

function onHighlight(_value: string, { index }: ListHighlightDetails) {
  const el = scroller.value
  if (!el) {
    return
  }
  const top = index * row
  if (top < el.scrollTop) {
    el.scrollTop = top
  } else if (top + row > el.scrollTop + el.clientHeight - 10) {
    el.scrollTop = top + row - el.clientHeight + 10
  }
  scrollTop.value = el.scrollTop
}
</script>

<template>
  <div
    data-slot="scroll"
    ref="scroller"
    @scroll="scrollTop = ($event.currentTarget as HTMLDivElement).scrollTop"
  >
    <Tree
      v-model:expanded="expanded"
      aria-label="Archive"
      :items="items"
      @highlight="onHighlight"
      :style="{ height: `${rows.length * row}px` }"
    >
      <TreeItem
        v-for="{ item, index } in visible"
        :key="item.value"
        :value="item.value"
        :style="{ top: `${index * row}px` }"
      >
        <TreeItemLabel>
          <TreeItemIndicator v-if="item.children">
            <ChevronRightIcon aria-hidden="true" />
          </TreeItemIndicator>
          {{ item.label }}
        </TreeItemLabel>
      </TreeItem>
    </Tree>
  </div>
</template>
