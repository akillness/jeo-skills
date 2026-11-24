<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue"
import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  type TreeActionDetails,
  type TreeItemData,
} from "@ui-sdk/vue/tree"
import { h, ref, type FunctionalComponent } from "vue"

const pages: TreeItemData[] = [
  {
    value: "getting-started",
    label: "Getting started",
    children: [
      { value: "introduction", label: "Introduction", href: "#introduction" },
      { value: "installation", label: "Installation", href: "#installation" },
    ],
  },
  {
    value: "components",
    label: "Components",
    children: [
      { value: "accordion", label: "Accordion", href: "#accordion" },
      { value: "dialog", label: "Dialog", href: "#dialog" },
      { value: "tree", label: "Tree", href: "#tree" },
    ],
  },
  { value: "changelog", label: "Changelog", href: "#changelog" },
]

const links = new Set(
  pages
    .flatMap((page) => [page, ...(page.children ?? [])])
    .filter((page) => page.href)
    .map((page) => page.value)
)

const Items: FunctionalComponent<{ items: TreeItemData[] }> = ({ items }) =>
  items.map(({ value, label, href, children }) => {
    const content = () => [
      children &&
        h(TreeItemIndicator, {}, () =>
          h(ChevronRightIcon, { "aria-hidden": "true" })
        ),
      label,
    ]
    return h(TreeItem, { key: value, value }, () => [
      h(
        TreeItemLabel,
        {},
        href
          ? {
              default: content,
              render: ({
                props,
                children,
              }: {
                props: Record<string, unknown>
                children: FunctionalComponent
              }) => h("a", { ...props, href }, h(children)),
            }
          : content
      ),
      children && h(TreeGroup, {}, () => h(Items, { items: children })),
    ])
  })

const current = ref("tree")

function onAction(value: string, { event }: TreeActionDetails) {
  if (!links.has(value)) {
    return
  }
  event?.preventDefault()
  current.value = value
}
</script>

<template>
  <Tree
    aria-label="Docs"
    :items="pages"
    mode="none"
    :current="current"
    @action="onAction"
  >
    <Items :items="pages" />
  </Tree>
</template>
