<script setup lang="ts">
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from "@lucide/vue"
import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
} from "@ui-sdk/vue/tree"
import { h, type FunctionalComponent } from "vue"

type Node = { value: string; label: string; children?: Node[] }

const files: Node[] = [
  {
    value: "app",
    label: "app",
    children: [
      { value: "app/layout.tsx", label: "layout.tsx" },
      { value: "app/page.tsx", label: "page.tsx" },
      {
        value: "app/settings",
        label: "settings",
        children: [{ value: "app/settings/page.tsx", label: "page.tsx" }],
      },
    ],
  },
  {
    value: "components",
    label: "components",
    children: [
      { value: "components/button.tsx", label: "button.tsx" },
      { value: "components/card.tsx", label: "card.tsx" },
    ],
  },
  { value: "components.json", label: "components.json" },
  { value: "package.json", label: "package.json" },
  { value: "README.md", label: "README.md" },
]

const Items: FunctionalComponent<{ items: Node[] }> = ({ items }) =>
  items.map(({ value, label, children }) =>
    h(TreeItem, { key: value, value }, () => [
      h(TreeItemLabel, {}, () => [
        ...(children
          ? [
              h(TreeItemIndicator, {}, () =>
                h(ChevronRightIcon, { "aria-hidden": "true" })
              ),
              h(FolderIcon, { "aria-hidden": "true" }),
              h(FolderOpenIcon, { "aria-hidden": "true" }),
            ]
          : [h(FileIcon, { "aria-hidden": "true" })]),
        h("span", {}, label),
      ]),
      children && h(TreeGroup, {}, () => h(Items, { items: children })),
    ])
  )
</script>

<template>
  <Tree
    aria-label="Files"
    :default-expanded="['app']"
    default-value="app/page.tsx"
  >
    <Items :items="files" />
  </Tree>
</template>
