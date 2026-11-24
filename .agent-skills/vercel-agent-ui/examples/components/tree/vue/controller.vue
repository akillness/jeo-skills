<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue"
import {
  createTreeController,
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  type TreeItemData,
} from "@ui-sdk/vue/tree"
import { h, type FunctionalComponent } from "vue"

const sections: TreeItemData[] = [
  {
    value: "account",
    label: "Account",
    children: [
      { value: "profile", label: "Profile" },
      {
        value: "security",
        label: "Security",
        children: [
          { value: "password", label: "Password" },
          { value: "two-factor", label: "Two-factor authentication" },
        ],
      },
    ],
  },
  {
    value: "workspace",
    label: "Workspace",
    children: [
      { value: "members", label: "Members" },
      { value: "billing", label: "Billing" },
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
        label,
      ]),
      children && h(TreeGroup, {}, () => h(Items, { items: children })),
    ])
  )

const settings = createTreeController()

function findTwoFactor() {
  settings.setValue("two-factor")
  settings.reveal("two-factor")
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="settings.expandAll()">Expand All</button>
      <button type="button" @click="settings.collapseAll()">
        Collapse All
      </button>
      <button type="button" @click="findTwoFactor">Find Two-Factor</button>
    </div>
    <Tree aria-label="Settings" :items="sections" :controller="settings">
      <Items :items="sections" />
    </Tree>
  </div>
</template>
