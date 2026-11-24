// @vitest-environment jsdom
// A controller swapped for another lets go of the instance, so it never
// drives a component it was taken from.
import { expect, test, vi } from "vitest"
import {
  createController,
  isControllerAttached,
} from "../src/foundation/kernel/controller"
import { keep, release, unwatched } from "../src/foundation/kernel/keep"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { createTabsController, tabs } from "../src/components/tabs/tabs"

test("a controller swapped for another detaches, and the new one attaches", () => {
  const first = createTabsController()
  const second = createTabsController()
  const instance = tabs({
    id: "settings",
    defaultValue: "a",
    controller: first,
  })
  expect(isControllerAttached(first)).toBe(true)
  instance.setOptions({ id: "settings", defaultValue: "a", controller: second })
  expect(isControllerAttached(first)).toBe(false)
  expect(isControllerAttached(second)).toBe(true)
  expect(first.setValue("c")).toBeUndefined()
  expect(instance.get().value).toBe("a")
  second.setValue("b")
  expect(instance.get().value).toBe("b")
  instance.destroy()
  expect(isControllerAttached(second)).toBe(false)
})

test("an instance its framework lets go of releases its controller, and takes it back when kept again", () => {
  const controller = createTabsController()
  const instance = unwatched(() => tabs({ id: "settings", defaultValue: "a" }))
  keep(instance)
  instance.setOptions({ id: "settings", defaultValue: "a", controller })
  expect(isControllerAttached(controller)).toBe(true)
  release(instance)
  expect(isControllerAttached(controller)).toBe(false)
  keep(instance)
  expect(isControllerAttached(controller)).toBe(true)
  controller.setValue("b")
  expect(instance.get().value).toBe("b")
  instance.destroy()
  expect(isControllerAttached(controller)).toBe(false)
})

test("a re-render of one instance leaves a shared controller with the instance it's attached to", () => {
  const controller = createTabsController()
  const desktop = tabs({ id: "desktop", defaultValue: "a", controller })
  const mobile = tabs({ id: "mobile", defaultValue: "a", controller })
  // The newest attach wins: the controller drives `mobile`.
  desktop.setOptions({ id: "desktop", defaultValue: "a", controller })
  controller.setValue("b")
  expect({ desktop: desktop.get().value, mobile: mobile.get().value }).toEqual({
    desktop: "a",
    mobile: "b",
  })
})

test("a controller hands out the same method on every read, calling the instance attached now", () => {
  const controller = createTabsController()
  const first = tabs({ id: "first", defaultValue: "a", controller })
  const setValue = controller.setValue
  expect(controller.setValue).toBe(setValue)
  first.destroy()
  const second = tabs({ id: "second", defaultValue: "a", controller })
  setValue("b")
  expect([first.get().value, second.get().value]).toEqual(["a", "b"])
})

test("a controller lists the attached api's members, without its internal one", () => {
  const controller = createTabsController()
  expect("setValue" in controller).toBe(false)
  expect(Object.keys(controller)).toEqual([])
  const instance = tabs({ id: "listed", defaultValue: "a", controller })
  expect("setValue" in controller).toBe(true)
  expect("internal" in controller).toBe(false)
  expect(Object.keys(controller)).toEqual(
    Object.keys(instance.api).filter((key) => key !== "internal")
  )
  expect({ ...controller }.getValue?.()).toBe("a")
  instance.destroy()
  expect("setValue" in controller).toBe(false)
})

const counter = definePrimitive({
  name: "counter",
  options: { controller: "value" },
  state: (_options: {
    controller?: ReturnType<typeof createController<{ count: () => number }>>
  }) => ({}),
  api: () => ({ count: () => 1 }),
  slots: () => ({}),
})

test("a primitive that takes a controller connects it to whatever its api returns", () => {
  const controller = createController<{ count: () => number }>()
  const instance = counter({ id: "c1", controller })
  expect(controller.count()).toBe(1)
  instance.destroy()
  expect(isControllerAttached(controller)).toBe(false)
})

test("an instance its framework may throw away connects its controller only once kept", () => {
  const controller = createController<{ count: () => number }>()
  const instance = unwatched(() => counter({ id: "c2", controller }))
  expect(isControllerAttached(controller)).toBe(false)
  keep(instance)
  expect(controller.count()).toBe(1)
  instance.destroy()
  expect(isControllerAttached(controller)).toBe(false)
})

test("a controller's methods can be called before it attaches and once it detaches, and return nothing", () => {
  const controller = createTabsController()
  expect(controller.getValue()).toBeUndefined()
  expect(controller.setValue("b")).toBeUndefined()
  const getValue = controller.getValue
  const instance = tabs({ id: "early", defaultValue: "a", controller })
  expect(getValue()).toBe("a")
  instance.destroy()
  expect(controller.getValue()).toBeUndefined()
  expect(getValue).toBe(controller.getValue)
})

test("a method called before its controller attaches warns once in development, and reads never do", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const controller = createTabsController()
  controller.getValue()
  controller.select("b")
  controller.select("c")
  expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
    expect.stringContaining(
      "select() was called before its component attached"
    ),
  ])
  const instance = tabs({ id: "warned", defaultValue: "a", controller })
  controller.setValue("b")
  instance.destroy()
  controller.setValue("c")
  expect(warn).toHaveBeenCalledTimes(1)
  warn.mockRestore()
})

test("a controller that isn't attached is never taken for a promise, a ref or a React element", async () => {
  const controller = createTabsController() as Record<string, unknown>
  expect(controller.then).toBeUndefined()
  expect(controller.toJSON).toBeUndefined()
  expect(controller.__v_isRef).toBeUndefined()
  expect(controller.$$typeof).toBeUndefined()
  expect(controller.constructor).toBeUndefined()
  expect(await Promise.resolve(controller)).toBe(controller)
})
