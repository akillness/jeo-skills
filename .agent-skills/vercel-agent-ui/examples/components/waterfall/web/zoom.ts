import type { WaterfallData } from "@ui-sdk/core/waterfall"
import "@ui-sdk/web/waterfall"
import { ChevronRight, createElement } from "lucide"

const trace: WaterfallData = [
  {
    value: "render",
    label: "render /dashboard",
    start: 0,
    duration: 1200,
    children: [
      { value: "session", label: "session", start: 20, duration: 80 },
      { value: "metrics", label: "metrics", start: 110, duration: 640 },
      { value: "alerts", label: "alerts", start: 110, duration: 260 },
      { value: "html", label: "stream html", start: 760, duration: 420 },
    ],
  },
]

const spans = [trace[0], ...trace[0].children!]
const full: [number, number] = [0, 1200]

function zoomed([start, end]: [number, number], factor: number) {
  const center = (start + end) / 2
  const half = Math.min(((end - start) * factor) / 2, full[1] / 2)
  const from = Math.min(Math.max(full[0], center - half), full[1] - half * 2)
  return [from, from + half * 2] as [number, number]
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Zoom In</button>
        <button type="button">Zoom Out</button>
        <button type="button">Reset</button>
      </div>
      <ui-waterfall
        aria-label="Dashboard render"
        default-expanded="render"
        default-value="metrics"
      >
        <ui-waterfall-header-row>
          <ui-waterfall-column-header>Span</ui-waterfall-column-header>
          <ui-waterfall-column-header aria-label="Timeline">
            <ui-waterfall-axis></ui-waterfall-axis>
          </ui-waterfall-column-header>
        </ui-waterfall-header-row>
        ${spans
          .map(
            (span) => `
              <ui-waterfall-row value="${span.value}">
                <ui-waterfall-row-header>
                  ${
                    span.children
                      ? `<ui-waterfall-indicator>${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}</ui-waterfall-indicator>`
                      : ""
                  }
                  ${span.label}
                </ui-waterfall-row-header>
                <ui-waterfall-bar></ui-waterfall-bar>
              </ui-waterfall-row>`
          )
          .join("")}
      </ui-waterfall>
    </div>
  `
  const waterfall = root.querySelector("ui-waterfall")!
  const [zoomIn, zoomOut, reset] = root.querySelectorAll("button")
  let range = full
  const show = (next: [number, number]) => {
    range = next
    waterfall.range = range
  }
  waterfall.items = trace
  show(full)
  zoomIn.addEventListener("click", () => show(zoomed(range, 0.5)))
  zoomOut.addEventListener("click", () => show(zoomed(range, 2)))
  reset.addEventListener("click", () => show(full))
}

export { mount }
