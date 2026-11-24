<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue"
import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemCheckbox,
  TreeItemIndicator,
  TreeItemLabel,
  type TreeItemData,
} from "@ui-sdk/vue/tree"
import { h, type FunctionalComponent } from "vue"
import { useLog } from "../../../shared/vue/log"

const items: TreeItemData[] = [
  {
    value: "frontend",
    label: "Frontend",
    children: [
      { value: "react", label: "React" },
      { value: "vue", label: "Vue" },
      { value: "svelte", label: "Svelte" },
    ],
  },
  {
    value: "backend",
    label: "Backend",
    children: [
      { value: "node", label: "Node" },
      {
        value: "databases",
        label: "Databases",
        children: [
          { value: "postgres", label: "Postgres" },
          { value: "sqlite", label: "SQLite" },
        ],
      },
    ],
  },
]

const Items: FunctionalComponent<{ items: TreeItemData[] }> = ({ items }) =>
  items.map(({ value, label, children }) =>
    h(TreeItem, { key: value, value }, () => [
      h(TreeItemLabel, {}, () => [
        children &&
          h(TreeItemIndicator, {}, () =>
            h(ChevronRightIcon, { "aria-hidden": "true" })
          ),
        h(TreeItemCheckbox, {}),
        label,
      ]),
      children && h(TreeGroup, {}, () => h(Items, { items: children })),
    ])
  )

const log = useLog()
</script>

<template>
  <Tree
    aria-label="Stack"
    :items="items"
    checkable
    mode="none"
    check-strategy="trunk"
    :default-checked="['react', 'postgres']"
    @checked-change="
      (checked) => log(`Checked ${checked.join(', ') || 'nothing'}`)
    "
    :default-expanded="['frontend', 'backend', 'databases']"
  >
    <Items :items="items" />
  </Tree>
</template>
