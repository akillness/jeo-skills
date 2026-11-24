import { visibleTreeRows, type TreeItemData } from "@ui-sdk/core/tree"
import "@ui-sdk/web/tree"
import { ChevronRight, createElement } from "lucide"

const items: TreeItemData[] = Array.from({ length: 100 }, (_, folder) => ({
  value: `folder-${folder + 1}`,
  label: `Folder ${folder + 1}`,
  children: Array.from({ length: 100 }, (_, file) => ({
    value: `folder-${folder + 1}/file-${file + 1}`,
    label: `File ${file + 1}.txt`,
  })),
}))

const row = 32
const height = 288

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="scroll">
      <ui-tree aria-label="Archive" default-expanded="folder-1"></ui-tree>
    </div>
  `
  const scroller = root.querySelector("div")!
  const tree = root.querySelector("ui-tree")!

  let rows = visibleTreeRows(items, ["folder-1"])

  const rendered = new Map<string, HTMLElement>()
  const render = () => {
    tree.style.height = `${rows.length * row}px`
    const start = Math.max(0, Math.floor(scroller.scrollTop / row) - 4)
    const end = Math.min(
      rows.length,
      Math.ceil((scroller.scrollTop + height) / row) + 4
    )
    const visible = new Map(
      rows.slice(start, end).map((entry) => [entry.item.value, entry])
    )
    for (const [value, el] of rendered) {
      if (visible.has(value)) {
        continue
      }
      el.remove()
      rendered.delete(value)
    }
    for (const [value, { item, index }] of visible) {
      let el = rendered.get(value)
      if (!el) {
        tree.insertAdjacentHTML(
          "beforeend",
          `<ui-tree-item value="${item.value}">
            <ui-tree-item-label>
              ${
                item.children
                  ? `<ui-tree-item-indicator>${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}</ui-tree-item-indicator>`
                  : ""
              }
              ${item.label}
            </ui-tree-item-label>
          </ui-tree-item>`
        )
        el = tree.lastElementChild as HTMLElement
        rendered.set(value, el)
      }
      el.style.top = `${index * row}px`
    }
  }
  render()
  tree.items = items
  scroller.addEventListener("scroll", render)
  tree.addEventListener("expandedchange", (event) => {
    rows = visibleTreeRows(items, event.detail.value)
    render()
  })
  tree.addEventListener("highlight", (event) => {
    const { index } = event.detail
    const top = index * row
    if (top < scroller.scrollTop) {
      scroller.scrollTop = top
    } else if (top + row > scroller.scrollTop + scroller.clientHeight - 10) {
      scroller.scrollTop = top + row - scroller.clientHeight + 10
    }
    render()
  })
}

export { mount }
