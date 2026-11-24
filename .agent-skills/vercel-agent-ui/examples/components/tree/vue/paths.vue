<script setup lang="ts">
import { ChevronRightIcon, LoaderCircleIcon } from "@lucide/vue"
import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  treeFromPaths,
  type TreeItemData,
  type TreeItemState,
} from "@ui-sdk/vue/tree"
import { h, type FunctionalComponent } from "vue"
import { useLog } from "../../../shared/vue/log"

const paths = [
  "src/index.ts",
  "src/lib/format.ts",
  "src/lib/parse.ts",
  "src/routes/home.tsx",
  "src/routes/about.tsx",
  "tests/",
  "package.json",
  "tsconfig.json",
]

const items = treeFromPaths(paths)
const files = new Set(paths.filter((path) => !path.endsWith("/")))

const Items: FunctionalComponent<{ items: TreeItemData[] }> = ({ items }) =>
  items.map(({ value, label, children }) =>
    h(TreeItem, { key: value, value }, () => [
      h(
        TreeItemLabel,
        {},
        {
          default: ({ state }: { state: TreeItemState }) => [
            children &&
              h(TreeItemIndicator, {}, () =>
                h(ChevronRightIcon, { "aria-hidden": "true" })
              ),
            h("span", {}, label),
            state.pending && h(LoaderCircleIcon, { "aria-hidden": "true" }),
          ],
        }
      ),
      children && h(TreeGroup, {}, () => h(Items, { items: children })),
    ])
  )

const log = useLog()

async function open(value: string) {
  if (!files.has(value)) {
    return
  }
  await new Promise((resolve) => setTimeout(resolve, 600))
  log(`Opened ${value}`)
}
</script>

<template>
  <Tree
    aria-label="Project"
    :paths="paths"
    :default-expanded="['src']"
    default-value="src/index.ts"
    activation="automatic"
    @action="open"
  >
    <Items :items="items" />
  </Tree>
</template>
