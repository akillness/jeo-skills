<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue"
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  type TreeItemData,
} from "@ui-sdk/vue/tree"
import { h, ref, type FunctionalComponent } from "vue"

const items: TreeItemData[] = [
  {
    value: "plans",
    label: "Plans",
    children: [
      { value: "free", label: "Free" },
      { value: "pro", label: "Pro" },
      { value: "enterprise", label: "Enterprise", disabled: true },
    ],
  },
  {
    value: "legacy",
    label: "Legacy plans",
    disabled: true,
    children: [{ value: "starter", label: "Starter" }],
  },
  { value: "custom", label: "Custom" },
]

const Items: FunctionalComponent<{ items: TreeItemData[] }> = ({ items }) =>
  items.map(({ value, label, disabled, children }) =>
    h(TreeItem, { key: value, value, disabled }, () => [
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

const focusable = ref(true)
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <label data-slot="label">
        <Switch v-model:checked="focusable">
          <SwitchThumb />
        </Switch>
        Focusable when disabled
      </label>
    </div>
    <Tree
      aria-label="Plans"
      :items="items"
      :default-expanded="['plans']"
      :focusable-when-disabled="focusable"
    >
      <Items :items="items" />
    </Tree>
  </div>
</template>
