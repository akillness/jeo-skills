import type { TreeItemData } from "@ui-sdk/core/tree"
import "@ui-sdk/web/tree"
import { ChevronRight, createElement } from "lucide"
import { log } from "../../../shared/web/log"

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
    <ui-tree aria-label="Folders" mode="multiple" default-value="updates,website" expand-on-press="false" default-expanded="inbox,projects">
      ${markup(items)}
    </ui-tree>
  `
  const tree = root.querySelector("ui-tree")!
  tree.items = items
  tree.addEventListener("valuechange", (event) => {
    const value = event.detail.value as string[]
    log(root, `${value.length} selected: ${value.join(", ")}`)
  })
}

export { mount }
