// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { drawer } from "../src/components/drawer/drawer"
import { mount, rerenderOf } from "../src/testing/mount"

// jsdom lays nothing out. A 1000px page and sheet put snap point 0.2 at 200px.
for (const name of ["offsetHeight", "clientHeight"] as const) {
  Object.defineProperty(HTMLElement.prototype, name, {
    configurable: true,
    get: () => 1000,
  })
}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never
Element.prototype.animate ??= function () {
  let running = true
  const animation = {
    finished: Promise.resolve(),
    onfinish: null as (() => void) | null,
    cancel: () => (running = false),
    finish() {},
    commitStyles() {},
  }
  requestAnimationFrame(() => running && animation.onfinish?.())
  return animation as never
}

const mounts: { unmount: () => void }[] = []
afterEach(() => mounts.splice(0).forEach((mounted) => mounted.unmount()))

const frames = (count: number) =>
  new Promise<void>((resolve) => {
    const next = (left: number) =>
      left ? requestAnimationFrame(() => next(left - 1)) : resolve()
    next(count)
  })

test("an open drawer whose snap point leaves its snap points rests on the first new one", async () => {
  const view = mount(
    drawer,
    { defaultOpen: true, snapPoints: [0.5, 1], defaultSnapPoint: 0.5 },
    `<div><trigger>Open</trigger><viewport><content><title>Filters</title></content></viewport></div>`
  )
  mounts.push(view)
  await frames(30)
  expect(view.state.snapPoint).toBe(0.5)
  rerenderOf(view).setOptions({ snapPoints: [0.2, 0.6] })
  await frames(30)
  expect(view.state.snapPoint).toBe(0.2)
})

test("an open drawer whose snap point leaves its snap points rests on its default when they keep it", async () => {
  const view = mount(
    drawer,
    { defaultOpen: true, snapPoints: [0.5, 1], defaultSnapPoint: 0.6 },
    `<div><trigger>Open</trigger><viewport><content><title>Filters</title></content></viewport></div>`
  )
  mounts.push(view)
  await frames(30)
  rerenderOf(view).setOptions({ snapPoints: [0.2, 0.6, 0.9] })
  await frames(30)
  expect(view.state.snapPoint).toBe(0.6)
})
