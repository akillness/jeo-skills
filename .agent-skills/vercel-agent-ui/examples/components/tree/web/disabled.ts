import type { TreeItemData } from "@ui-sdk/core/tree"
import "@ui-sdk/web/switch"
import "@ui-sdk/web/tree"
import { ChevronRight, createElement } from "lucide"

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

function markup(items: TreeItemData[]) {
  let html = ""
  for (const item of items) {
    html += `
      <ui-tree-item value="${item.value}"${item.disabled ? " disabled" : ""}>
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
        <label data-slot="label">
          <ui-switch default-checked>
            <ui-switch-thumb></ui-switch-thumb>
          </ui-switch>
          Focusable when disabled
        </label>
      </div>
      <ui-tree aria-label="Plans" default-expanded="plans">
        ${markup(items)}
      </ui-tree>
    </div>
  `
  const tree = root.querySelector("ui-tree")!
  tree.items = items
  root
    .querySelector("ui-switch")!
    .addEventListener("checkedchange", (event) => {
      tree.setAttribute("focusable-when-disabled", String(event.detail.value))
    })
}

export { mount }
