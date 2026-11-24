"use client"

import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  type TreeItemData,
} from "@ui-sdk/react/tree"
import { ChevronRightIcon } from "lucide-react"
import * as React from "react"

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

function Items({ items }: { items: TreeItemData[] }) {
  return items.map((item) => (
    <TreeItem key={item.value} value={item.value}>
      <TreeItemLabel render={item.href ? <a href={item.href} /> : undefined}>
        {item.children && (
          <TreeItemIndicator>
            <ChevronRightIcon aria-hidden="true" />
          </TreeItemIndicator>
        )}
        {item.label}
      </TreeItemLabel>
      {item.children && (
        <TreeGroup>
          <Items items={item.children} />
        </TreeGroup>
      )}
    </TreeItem>
  ))
}

function Example() {
  const [current, setCurrent] = React.useState("tree")
  return (
    <Tree
      aria-label="Docs"
      items={pages}
      mode="none"
      current={current}
      onAction={(value, { event }) => {
        if (!links.has(value)) {
          return
        }
        event?.preventDefault()
        setCurrent(value)
      }}
    >
      <Items items={pages} />
    </Tree>
  )
}

export { Example }
