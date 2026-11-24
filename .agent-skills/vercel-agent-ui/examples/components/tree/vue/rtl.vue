<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue"
import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
} from "@ui-sdk/vue/tree"
import { h, type FunctionalComponent } from "vue"

type Node = { value: string; label: string; children?: Node[] }

const folders: Node[] = [
  {
    value: "documents",
    label: "المستندات",
    children: [
      { value: "reports", label: "التقارير" },
      { value: "invoices", label: "الفواتير" },
    ],
  },
  {
    value: "photos",
    label: "الصور",
    children: [
      { value: "trips", label: "الرحلات" },
      { value: "family", label: "العائلة" },
    ],
  },
  { value: "downloads", label: "التنزيلات" },
]

const Items: FunctionalComponent<{ items: Node[] }> = ({ items }) =>
  items.map(({ value, label, children }) =>
    h(TreeItem, { key: value, value }, () => [
      h(TreeItemLabel, {}, () => [
        children &&
          h(TreeItemIndicator, {}, () =>
            h(ChevronRightIcon, { "aria-hidden": "true" })
          ),
        label,
      ]),
      children && h(TreeGroup, {}, () => h(Items, { items: children })),
    ])
  )
</script>

<template>
  <div dir="rtl">
    <Tree aria-label="الملفات" :default-expanded="['documents']">
      <Items :items="folders" />
    </Tree>
  </div>
</template>
