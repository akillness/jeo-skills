import {
  visibleWaterfallRows,
  type WaterfallData,
} from "@ui-sdk/core/waterfall"
import "@ui-sdk/web/waterfall"
import { ChevronRight, createElement } from "lucide"

const trace: WaterfallData = Array.from({ length: 2000 }, (_, job) => ({
  value: `job-${job + 1}`,
  label: `job ${job + 1}`,
  start: job * 4,
  duration: 60,
  children: Array.from({ length: 4 }, (_, step) => ({
    value: `job-${job + 1}/step-${step + 1}`,
    label: `step ${step + 1}`,
    start: job * 4 + step * 15,
    duration: 15,
  })),
}))

const row = 32
const height = 288

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="scroll">
      <ui-waterfall aria-label="Build trace" default-expanded="job-1"></ui-waterfall>
    </div>
  `
  const scroller = root.querySelector("div")!
  const waterfall = root.querySelector("ui-waterfall")!

  let rows = visibleWaterfallRows(trace, ["job-1"])

  const rendered = new Map<string, HTMLElement>()
  const render = () => {
    waterfall.style.height = `${rows.length * row}px`
    waterfall.setAttribute("aria-rowcount", String(rows.length))
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
        waterfall.insertAdjacentHTML(
          "beforeend",
          `<ui-waterfall-row value="${item.value}">
            <ui-waterfall-row-header>
              ${
                item.children
                  ? `<ui-waterfall-indicator>${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}</ui-waterfall-indicator>`
                  : ""
              }
              ${item.label}
            </ui-waterfall-row-header>
            <ui-waterfall-bar></ui-waterfall-bar>
          </ui-waterfall-row>`
        )
        el = waterfall.lastElementChild as HTMLElement
        rendered.set(value, el)
      }
      el.style.top = `${index * row}px`
      el.setAttribute("aria-rowindex", String(index + 1))
    }
  }
  render()
  waterfall.range = [0, 400]
  waterfall.items = trace
  scroller.addEventListener("scroll", render)
  waterfall.addEventListener("expandedchange", (event) => {
    rows = visibleWaterfallRows(trace, event.detail.value)
    render()
  })
  waterfall.addEventListener("highlight", (event) => {
    const { index } = event.detail
    const top = index * row
    if (top < scroller.scrollTop) {
      scroller.scrollTop = top
    } else if (top + row > scroller.scrollTop + scroller.clientHeight) {
      scroller.scrollTop = top + row - scroller.clientHeight
    }
    render()
  })
}

export { mount }
