import type { TreeItemData } from "@ui-sdk/core/tree"
import "@ui-sdk/web/tree"
import { ChevronRight, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const items: TreeItemData[] = [
  {
    value: "frontend",
    label: "Frontend",
    children: [
      { value: "react", label: "React" },
      { value: "vue", label: "Vue" },
      { value: "svelte", label: "Svelte" },
    ],
  },
  {
    value: "backend",
    label: "Backend",
    children: [
      { value: "node", label: "Node" },
      {
        value: "databases",
        label: "Databases",
        children: [
          { value: "postgres", label: "Postgres" },
          { value: "sqlite", label: "SQLite" },
        ],
      },
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
          <ui-tree-item-checkbox></ui-tree-item-checkbox>
          ${item.label}
        </ui-tree-item-label>
        ${item.children ? `<ui-tree-group>${markup(item.children)}</ui-tree-group>` : ""}
      </ui-tree-item>`
  }
  return html
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tree aria-label="Stack" checkable mode="none" check-strategy="trunk" default-checked="react,postgres" default-expanded="frontend,backend,databases">
      ${markup(items)}
    </ui-tree>
  `
  const tree = root.querySelector("ui-tree")!
  tree.items = items
  tree.addEventListener("checkedchange", (event) => {
    log(root, `Checked ${event.detail.value.join(", ") || "nothing"}`)
  })
}

export { mount }
