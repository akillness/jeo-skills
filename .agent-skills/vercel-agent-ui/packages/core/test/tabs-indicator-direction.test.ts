// @vitest-environment jsdom
// Styles skip the indicator's transitions while the direction is "none", for
// the first placement, so the first move has its direction before it moves.
import { afterEach, expect, test } from "vitest"
import { tabs } from "../src/components/tabs/tabs"
import { mount } from "../src/testing/mount"

const mounts: { unmount: () => void }[] = []
afterEach(() => mounts.splice(0).forEach((mounted) => mounted.unmount()))

test("the indicator has its direction before its variables move", async () => {
  const view = mount(
    tabs,
    { defaultValue: "a" },
    `<root><list><tab value="a">A</tab><tab value="b">B</tab><indicator /></list><panel value="a">A</panel><panel value="b">B</panel></root>`
  )
  mounts.push(view)
  const indicator = view.part("indicator")!
  await new Promise((resolve) => setTimeout(resolve))
  expect(indicator.getAttribute("data-activation-direction")).toBe("none")
  const seen: (string | null)[] = []
  const write = indicator.style.setProperty.bind(indicator.style)
  indicator.style.setProperty = (...args) => {
    seen.push(indicator.getAttribute("data-activation-direction"))
    write(...args)
  }
  await view.click(view.part("tab", "b")!)
  expect(seen.length).toBeGreaterThan(0)
  expect(new Set(seen)).toEqual(new Set(["right"]))
})
