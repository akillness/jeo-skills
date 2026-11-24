// @vitest-environment jsdom
// Destroying an instance stops everything it started outside itself, once.
import { expect, test, vi } from "vitest"
import {
  createController,
  isControllerAttached,
} from "../src/foundation/kernel/controller"
import {
  keep,
  release,
  unwatched,
  whenKept,
} from "../src/foundation/kernel/keep"
import { definePrimitive } from "../src/foundation/kernel/primitive"

test("destroy() runs each onDestroy cleanup once, however often it's called", () => {
  let cleanups = 0
  const thing = definePrimitive({
    name: "thing",
    state: () => ({}),
    api: (context) => {
      context.onDestroy(() => cleanups++)
      return {}
    },
    slots: () => ({}),
  })
  const instance = thing({ id: "twice" })
  instance.destroy()
  instance.destroy()
  expect(cleanups).toBe(1)
})

test("destroy() stops what whenKept started for an instance no framework releases", () => {
  let stops = 0
  const follower = definePrimitive({
    name: "follower",
    state: () => ({}),
    api: () => {
      whenKept(() => () => stops++)
      return {}
    },
    slots: () => ({}),
  })
  const instance = follower({ id: "follower" })
  instance.destroy()
  instance.destroy()
  expect(stops).toBe(1)
})

test("a destroyed instance never takes its controller back", () => {
  const thing = definePrimitive({
    name: "thing",
    options: { controller: "value" },
    state: (_: { controller?: unknown }) => ({}),
    api: () => ({ ping: () => "pong" }),
    slots: () => ({}),
  })
  const first = createController<{ ping: () => string }>()
  const second = createController<{ ping: () => string }>()
  const instance = thing({ id: "gone", controller: first })
  instance.destroy()
  instance.setOptions({ id: "gone", controller: first })
  instance.setOptions({ id: "gone", controller: second })
  expect([isControllerAttached(first), isControllerAttached(second)]).toEqual([
    false,
    false,
  ])
})

test("an instance made while another is made has a lifecycle of its own, kept with the outer one", () => {
  const log: string[] = []
  const inner = definePrimitive({
    name: "inner",
    state: () => ({}),
    api: () => {
      whenKept(() => {
        log.push("inner start")
        return () => log.push("inner stop")
      })
      return {}
    },
    slots: () => ({}),
  })
  const outer = definePrimitive({
    name: "outer",
    state: () => ({}),
    api: () => {
      whenKept(() => {
        log.push("outer start")
        return () => log.push("outer stop")
      })
      return { inner: inner({ id: "inner" }) }
    },
    slots: () => ({}),
  })
  const instance = unwatched(() => outer({ id: "outer" }))
  expect(log).toEqual([])
  keep(instance)
  expect(log).toEqual(["outer start", "inner start"])
  instance.api.inner.destroy()
  expect(log).toEqual(["outer start", "inner start", "inner stop"])
  release(instance)
  keep(instance)
  instance.destroy()
  expect(log).toEqual([
    "outer start",
    "inner start",
    "inner stop",
    "outer stop",
    "outer start",
    "outer stop",
  ])
})

test("whenKept outside an instance's setup starts nothing and warns", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  let started = 0
  whenKept(() => {
    started++
  })
  expect(started).toBe(0)
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("`whenKept` runs only while an instance is made")
  )
  warn.mockRestore()
})
