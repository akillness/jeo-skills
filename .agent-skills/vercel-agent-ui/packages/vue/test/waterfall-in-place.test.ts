// @vitest-environment jsdom
// Vue apps change `items` and `range` in place, and the waterfall follows.
import { afterEach, expect, test } from "vitest"
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  type App,
} from "vue"
import { Waterfall, WaterfallAxis, type WaterfallData } from "../src/waterfall"

Element.prototype.getAnimations ??= () => []

let app: App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

function mount(render: () => unknown) {
  const el = document.body.appendChild(document.createElement("div"))
  app = createApp(defineComponent({ setup: () => render }))
  app.mount(el)
  return el
}

const trace = (): WaterfallData => [
  {
    value: "page",
    label: "GET /",
    start: 0,
    duration: 1000,
    children: [{ value: "api", label: "GET /api", start: 500, duration: 500 }],
  },
]

test("the rows it renders itself follow spans pushed in place", async () => {
  const items = reactive(trace())
  const el = mount(() => h(Waterfall, { "aria-label": "Requests", items }))
  const rows = () => el.querySelectorAll('[role="row"]').length
  items[0].children!.push({ value: "db", label: "db", start: 600, duration: 1 })
  await nextTick()
  items[0].children!.push({ value: "kv", label: "kv", start: 700, duration: 1 })
  await nextTick()
  items.push({ value: "font", label: "font", start: 1000, duration: 100 })
  await nextTick()
  expect(rows()).toBe(5)
})

test("the axis follows a range changed in place", async () => {
  const range = reactive<[number, number]>([0, 1000])
  const el = mount(() =>
    h(Waterfall, { "aria-label": "Requests", items: trace(), range }, () => [
      h(WaterfallAxis, { maxTicks: 3 }),
    ])
  )
  const axis = () =>
    el.querySelector('[data-slot="waterfall-axis"]')!.textContent
  const before = axis()
  range[1] = 100
  await nextTick()
  expect(axis()).not.toBe(before)
})
