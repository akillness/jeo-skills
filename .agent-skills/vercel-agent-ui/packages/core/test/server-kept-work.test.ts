// @vitest-environment node
// On a server, where nothing is ever destroyed, an instance starts nothing
// outside itself, so a module-level controller never holds a request's instance.
import { expect, test } from "vitest"
import { isControllerAttached } from "../src/foundation/kernel/controller"
import { whenKept } from "../src/foundation/kernel/keep"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { checkServer } from "../src/testing/check-server"
import { checkbox } from "../src/components/checkbox/checkbox"
import { collapsible } from "../src/components/collapsible/collapsible"
import { createTabsController, tabs } from "../src/components/tabs/tabs"

test("an instance made on a server attaches no controller", () => {
  const controller = createTabsController()
  tabs({ id: "alice", defaultValue: "a", controller })
  tabs({ id: "bob", defaultValue: "b", controller })
  expect(isControllerAttached(controller)).toBe(false)
  expect(controller.getValue()).toBeUndefined()
})

test("an instance made on a server starts nothing whenKept waits on", () => {
  let started = 0
  const follower = definePrimitive({
    name: "follower",
    state: () => ({}),
    api: () => {
      whenKept(() => {
        started++
      })
      return {}
    },
    slots: () => ({}),
  })
  follower({ id: "follower" }).destroy()
  expect(started).toBe(0)
})

test("checkServer passes tabs in plain Node", () => {
  const html = checkServer(
    tabs,
    { defaultValue: "a" },
    `<root><list><tab value="a">A</tab></list><panel value="a">A</panel></root>`
  )
  expect(html).toContain('role="tablist"')
})

test("checkServer passes a checkbox in plain Node", () => {
  expect(checkServer(checkbox, {}, `<root>Accept</root>`)).toContain(
    'role="checkbox"'
  )
})

test("checkServer passes a collapsible in plain Node", () => {
  expect(
    checkServer(
      collapsible,
      {},
      `<root><trigger>Show</trigger><panel>More</panel></root>`
    )
  ).toContain("aria-expanded")
})
