import type { TreeItemData } from "@ui-sdk/core/tree"
import "@ui-sdk/web/tree"
import { ChevronRight, createElement } from "lucide"

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

function markup(items: TreeItemData[]) {
  let html = ""
  for (const item of items) {
    html += `
      <ui-tree-item value="${item.value}">
        <ui-tree-item-label>
          ${
            item.children
              ? `<ui-tree-item-indicator>${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}</ui-tree-item-indicator>`
              : ""
          }
          ${item.label}
        </ui-tree-item-label>
        ${item.children ? `<ui-tree-group>${markup(item.children)}</ui-tree-group>` : ""}
      </ui-tree-item>`
  }
  return html
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Expand All</button>
        <button type="button">Collapse All</button>
        <button type="button">Find Two-Factor</button>
      </div>
      <ui-tree aria-label="Settings">
        ${markup(sections)}
      </ui-tree>
    </div>
  `
  const tree = root.querySelector("ui-tree")!
  const [expand, collapse, find] = root.querySelectorAll("button")
  tree.items = sections
  expand.addEventListener("click", () => tree.api.expandAll())
  collapse.addEventListener("click", () => tree.api.collapseAll())
  find.addEventListener("click", () => {
    tree.api.setValue("two-factor")
    tree.api.reveal("two-factor")
  })
}

export { mount }
