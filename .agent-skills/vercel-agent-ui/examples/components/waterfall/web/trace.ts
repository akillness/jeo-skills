import type { WaterfallData, WaterfallDataItem } from "@ui-sdk/core/waterfall"
import "@ui-sdk/web/waterfall"
import { ChevronRight, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const trace: WaterfallData = [
  {
    value: "checkout",
    label: "POST /checkout",
    start: 0,
    duration: 920,
    children: [
      { value: "auth", label: "auth.verify", start: 12, duration: 64 },
      {
        value: "cart",
        label: "cart.load",
        start: 80,
        duration: 310,
        children: [
          {
            value: "cart-db",
            label: "db.query carts",
            start: 96,
            duration: 140,
          },
          {
            value: "prices",
            label: "pricing.quote",
            start: 240,
            duration: 136,
          },
        ],
      },
      {
        value: "payment",
        label: "payments.charge",
        start: 400,
        duration: 470,
        children: [
          { value: "fraud", label: "fraud.score", start: 410, duration: 120 },
          {
            value: "gateway",
            label: "gateway.capture",
            start: 540,
            duration: 310,
          },
        ],
      },
      { value: "email", label: "email.enqueue", start: 880, duration: 30 },
    ],
  },
]

function rows(items: WaterfallDataItem[]): string {
  return items
    .map(
      (item) => `
        <ui-waterfall-row value="${item.value}">
          <ui-waterfall-row-header>
            ${
              item.children
                ? `<ui-waterfall-indicator>${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}</ui-waterfall-indicator>`
                : ""
            }
            ${item.label}
          </ui-waterfall-row-header>
          <ui-waterfall-bar></ui-waterfall-bar>
        </ui-waterfall-row>
        ${rows(item.children ?? [])}`
    )
    .join("")
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Expand All</button>
        <button type="button">Collapse All</button>
      </div>
      <ui-waterfall aria-label="Checkout trace" default-expanded="checkout">
        <ui-waterfall-header-row>
          <ui-waterfall-column-header>Span</ui-waterfall-column-header>
          <ui-waterfall-column-header aria-label="Timeline">
            <ui-waterfall-axis></ui-waterfall-axis>
          </ui-waterfall-column-header>
        </ui-waterfall-header-row>
        ${rows(trace)}
      </ui-waterfall>
    </div>
  `
  const waterfall = root.querySelector("ui-waterfall")!
  const [expand, collapse] = root.querySelectorAll("button")
  waterfall.format = {
    style: "unit",
    unit: "millisecond",
    unitDisplay: "narrow",
  }
  waterfall.items = trace
  expand.addEventListener("click", () => waterfall.api.expandAll())
  collapse.addEventListener("click", () => waterfall.api.collapseAll())
  waterfall.addEventListener("valuechange", (event) =>
    log(root, `Selected ${event.detail.value}`)
  )
}

export { mount }
