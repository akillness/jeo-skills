import type { TreeItemData } from "@ui-sdk/core/tree"
import "@ui-sdk/web/tree"
import { ChevronRight, createElement } from "lucide"

const items: TreeItemData[] = [
  {
    value: "planets",
    label: "Planets",
    children: [
      { value: "mercury", label: "Mercury" },
      { value: "venus", label: "Venus" },
      {
        value: "earth",
        label: "Earth",
        children: [{ value: "moon", label: "The Moon" }],
      },
      {
        value: "mars",
        label: "Mars",
        children: [
          { value: "phobos", label: "Phobos" },
          { value: "deimos", label: "Deimos" },
        ],
      },
    ],
  },
  {
    value: "dwarf-planets",
    label: "Dwarf planets",
    children: [
      { value: "ceres", label: "Ceres" },
      {
        value: "pluto",
        label: "Pluto",
        children: [{ value: "charon", label: "Charon" }],
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
          ${item.label}
        </ui-tree-item-label>
        ${item.children ? `<ui-tree-group>${markup(item.children)}</ui-tree-group>` : ""}
      </ui-tree-item>`
  }
  return html
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tree aria-label="Solar system" hidden-until-found>
      ${markup(items)}
    </ui-tree>
  `
  root.querySelector("ui-tree")!.items = items
}

export { mount }
