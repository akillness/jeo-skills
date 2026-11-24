<script setup lang="ts">
import { ChevronRightIcon, LoaderCircleIcon, RotateCwIcon } from "@lucide/vue"
import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  type TreeAnnouncement,
  type TreeItemState,
} from "@ui-sdk/vue/tree"
import { h, ref, type FunctionalComponent } from "vue"

type Node = { value: string; label: string; branch?: boolean }

const top: Node[] = [
  { value: "users", label: "users", branch: true },
  { value: "orders", label: "orders", branch: true },
  { value: "archive", label: "archive", branch: true },
]

let archiveAsked = false
async function fetchChildren(value: string, signal: AbortSignal) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 800)
    signal.addEventListener(
      "abort",
      () => (clearTimeout(timer), reject(signal.reason))
    )
  })
  if (value === "archive" && !archiveAsked) {
    archiveAsked = true
    throw new Error("Network error")
  }
  return Array.from({ length: 3 }, (_, index) => ({
    value: `${value}/${index + 1}`,
    label: `${value.slice(0, -1)}_${index + 1}.json`,
  }))
}

const Items: FunctionalComponent<{
  items: Node[]
  loaded: Record<string, Node[]>
}> = ({ items, loaded }) =>
  items.map(({ value, label, branch }) =>
    h(TreeItem, { key: value, value, branch }, () => [
      h(TreeItemLabel, {}, () => [
        branch &&
          h(
            TreeItemIndicator,
            {},
            {
              default: ({ state }: { state: TreeItemState }) =>
                state.loading
                  ? h(LoaderCircleIcon, { "aria-hidden": "true" })
                  : state.failed
                    ? h(RotateCwIcon, { "aria-hidden": "true" })
                    : h(ChevronRightIcon, { "aria-hidden": "true" }),
            }
          ),
        label,
      ]),
      loaded[value] &&
        h(TreeGroup, {}, () => h(Items, { items: loaded[value], loaded })),
    ])
  )

const loaded = ref<Record<string, Node[]>>({})

async function loadChildren(
  value: string,
  { signal }: { signal: AbortSignal }
) {
  const children = await fetchChildren(value, signal)
  loaded.value = { ...loaded.value, [value]: children }
}

function announcement({ type, label }: TreeAnnouncement) {
  return {
    expanded: "Expanded",
    collapsed: "Collapsed",
    loading: `Loading ${label}`,
    "load-failed": `${label} didn't load. Try again.`,
  }[type]
}
</script>

<template>
  <Tree
    aria-label="Database"
    :load-children="loadChildren"
    :announcement="announcement"
  >
    <Items :items="top" :loaded="loaded" />
  </Tree>
</template>
