<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue"
import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  type TreeItemData,
} from "@ui-sdk/vue/tree"
import { h, type FunctionalComponent } from "vue"
import { useLog } from "../../../shared/vue/log"

const items: TreeItemData[] = [
  {
    value: "inbox",
    label: "Inbox",
    children: [
      { value: "updates", label: "Updates" },
      { value: "forums", label: "Forums" },
      { value: "promotions", label: "Promotions" },
    ],
  },
  {
    value: "projects",
    label: "Projects",
    children: [
      { value: "website", label: "Website" },
      { value: "mobile", label: "Mobile app" },
    ],
  },
  { value: "archive", label: "Archive" },
  { value: "trash", label: "Trash" },
]

const Items: FunctionalComponent<{ items: TreeItemData[] }> = ({ items }) =>
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

const log = useLog()
</script>

<template>
  <Tree
    aria-label="Folders"
    :items="items"
    mode="multiple"
    :default-value="['updates', 'website']"
    @value-change="
      (value) =>
        Array.isArray(value) &&
        log(`${value.length} selected: ${value.join(', ')}`)
    "
    :expand-on-press="false"
    :default-expanded="['inbox', 'projects']"
  >
    <Items :items="items" />
  </Tree>
</template>
