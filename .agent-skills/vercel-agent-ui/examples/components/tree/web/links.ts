import type { TreeItemData } from "@ui-sdk/core/tree"
import "@ui-sdk/web/tree"
import { ChevronRight, createElement } from "lucide"

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

function markup(items: TreeItemData[]) {
  let html = ""
  for (const item of items) {
    const content = `
      ${
        item.children
          ? `<ui-tree-item-indicator>${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}</ui-tree-item-indicator>`
          : ""
      }
      ${item.label}`
    html += `
      <ui-tree-item value="${item.value}">
        ${
          item.href
            ? `<ui-tree-item-label as-child><a href="${item.href}">${content}</a></ui-tree-item-label>`
            : `<ui-tree-item-label>${content}</ui-tree-item-label>`
        }
        ${item.children ? `<ui-tree-group>${markup(item.children)}</ui-tree-group>` : ""}
      </ui-tree-item>`
  }
  return html
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tree aria-label="Docs" mode="none" current="tree">
      ${markup(pages)}
    </ui-tree>
  `
  const tree = root.querySelector("ui-tree")!
  tree.items = pages
  tree.addEventListener("action", (event) => {
    const { value, event: trigger } = event.detail
    if (!links.has(value)) {
      return
    }
    trigger?.preventDefault()
    tree.setAttribute("current", value)
  })
}

export { mount }
