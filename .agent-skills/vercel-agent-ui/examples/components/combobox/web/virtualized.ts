import "@ui-sdk/web/combobox"
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
    <ui-combobox>
      <div data-slot="stack">
        <ui-combobox-label>Item</ui-combobox-label>
        <div data-slot="row">
          <ui-combobox-input>
            <input placeholder="Search 10,000 items…" />
          </ui-combobox-input>
          <ui-combobox-trigger>
            <button aria-label="Show items">${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-combobox-trigger>
        </div>
      </div>
      <ui-combobox-content hidden>
        <ui-combobox-empty>No items found.</ui-combobox-empty>
        <div>
          <ui-combobox-list></ui-combobox-list>
        </div>
      </ui-combobox-content>
    </ui-combobox>
  `
  const combobox = root.querySelector("ui-combobox") as HTMLElement & {
    items: typeof manyItems
  }
  const scroller = root.querySelector<HTMLElement>("ui-combobox-content > div")!
  const list = root.querySelector<HTMLElement>("ui-combobox-list")!

  let matches = manyItems
  const filter = (text: string) => {
    const needle = text.trim().toLowerCase()
    matches = needle
      ? manyItems.filter((item) => item.label.toLowerCase().includes(needle))
      : manyItems
  }

  const rendered = new Map<string, HTMLElement>()
  const render = () => {
    list.style.height = `${matches.length * row}px`
    const { start, end } = visibleRows(
      scroller.scrollTop,
      height,
      matches.length,
      row
    )
    const visible = new Map(
      matches
        .slice(start, end)
        .map((item, offset) => [item.value, start + offset])
    )
    for (const [value, el] of rendered) {
      if (visible.has(value)) {
        continue
      }
      el.remove()
      rendered.delete(value)
    }
    for (const [value, index] of visible) {
      const existing = rendered.get(value)
      if (existing) {
        existing.setAttribute("index", String(index))
        existing.style.top = `${index * row}px`
        continue
      }
      const item = matches[index]
      list.insertAdjacentHTML(
        "beforeend",
        `<ui-combobox-item value="${item.value}" label="${item.label}" index="${index}" style="top: ${index * row}px; height: ${row}px">${item.label}</ui-combobox-item>`
      )
      rendered.set(value, list.lastElementChild as HTMLElement)
    }
  }
  render()
  combobox.items = manyItems
  scroller.addEventListener("scroll", render)
  combobox.addEventListener("querychange", (event) => {
    const { value, reason } = (
      event as CustomEvent<{ value: string; reason: string }>
    ).detail
    filter(reason === "input-change" ? value : "")
    render()
  })
  combobox.addEventListener("highlight", (event) => {
    const { index } = (
      event as CustomEvent<{ value: string | null; index: number }>
    ).detail
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
