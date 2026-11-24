import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { ChevronDown, createElement } from "lucide"

const manyItems = Array.from({ length: 10_000 }, (_, index) => ({
  value: `item-${index + 1}`,
  label: `Item ${index + 1}`,
}))

function visibleRows(
  scrollTop: number,
  height: number,
  count: number,
  row: number
) {
  const start = Math.max(0, Math.floor(scrollTop / row) - 4)
  const end = Math.min(count, Math.ceil((scrollTop + height) / row) + 4)
  return { start, end }
}

function scrollForRow(
  index: number,
  scrollTop: number,
  height: number,
  row: number
) {
  const top = index * row
  if (top < scrollTop) {
    return top
  }
  if (top + row > scrollTop + height) {
    return top + row - height
  }
  return scrollTop
}

const row = 32
const height = 288

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Item</ui-field-label>
      <ui-select placeholder="Select an item">
        <ui-select-trigger>
          <button>
            <ui-select-value></ui-select-value>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-select-trigger>
        <ui-select-content>
          <div style="height: ${height}px">
            <ui-select-list>
              <div style="height: ${manyItems.length * row}px"></div>
            </ui-select-list>
          </div>
        </ui-select-content>
      </ui-select>
    </ui-field>
  `
  const select = root.querySelector("ui-select")!
  const scroller = root.querySelector<HTMLElement>("ui-select-content > div")!
  const rows = root.querySelector<HTMLElement>("ui-select-list > div")!

  const rendered = new Map<number, Element>()
  const render = () => {
    const { start, end } = visibleRows(
      scroller.scrollTop,
      height,
      manyItems.length,
      row
    )
    for (const [index, el] of rendered) {
      if (index >= start && index < end) {
        continue
      }
      el.remove()
      rendered.delete(index)
    }
    for (let index = start; index < end; index++) {
      if (rendered.has(index)) {
        continue
      }
      const item = manyItems[index]
      rows.insertAdjacentHTML(
        "beforeend",
        `<ui-select-item value="${item.value}" label="${item.label}" index="${index}" style="top: ${index * row}px; height: ${row}px">${item.label}</ui-select-item>`
      )
      rendered.set(index, rows.lastElementChild!)
    }
  }
  render()
  select.items = manyItems
  scroller.addEventListener("scroll", render)
  select.addEventListener("highlight", (event) => {
    const { index } = event.detail
    if (index < 0) {
      return
    }
    scroller.scrollTop = scrollForRow(
      index,
      scroller.scrollTop,
      scroller.clientHeight,
      row
    )
    render()
  })
}

export { mount }
