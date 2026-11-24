// @vitest-environment jsdom
import { beforeAll, expect, test } from "vitest"
import { defineWaterfallElements } from "../src/waterfall"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

type WaterfallElement = HTMLElement & {
  items: unknown
  range?: [number, number]
}

const items = [
  { value: "a", label: "A", start: 0, duration: 100 },
  { value: "b", label: "B", start: 100, duration: 100 },
]

beforeAll(() => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  defineWaterfallElements()
})

async function mount(content = "") {
  document.body.innerHTML = `<ui-waterfall aria-label="Requests">${content}</ui-waterfall>`
  const waterfall = document.body.firstElementChild as WaterfallElement
  waterfall.items = items
  await wait()
  return waterfall
}

test("a new range keeps the rows the waterfall rendered", async () => {
  const waterfall = await mount()
  const row = () => waterfall.querySelector('ui-waterfall-row[value="b"]')
  const before = row()
  waterfall.range = [0, 150]
  await wait()
  expect(row()).toBe(before)
})

test("an axis follows its max-ticks", async () => {
  const waterfall = await mount(
    `<ui-waterfall-axis max-ticks="6"></ui-waterfall-axis>`
  )
  const axis = waterfall.querySelector("ui-waterfall-axis")!
  const count = axis.children.length
  axis.setAttribute("max-ticks", "2")
  await wait()
  expect(axis.children.length).toBeLessThan(count)
  expect(axis.hasAttribute("data-ticks")).toBe(false)
})

test("an empty tick shows its new time", async () => {
  const waterfall = await mount(
    `<ui-waterfall-tick time="100"></ui-waterfall-tick>`
  )
  const tick = waterfall.querySelector("ui-waterfall-tick")!
  expect(tick.textContent).toBe("100 ms")
  tick.setAttribute("time", "150")
  await wait()
  expect(tick.textContent).toBe("150 ms")
  expect(tick.hasAttribute("data-text")).toBe(false)
})
