import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import App from "./apps/events-app.svelte"

// Lets the core's microtasks run, like a press opening a popup, then renders.
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 20))
  flushSync()
}
const byLabel = (label: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${label}"]`)
const press = (key: string) =>
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  )

let target: HTMLElement
let app: ReturnType<typeof mount>
const log: string[] = []
async function render(props: Record<string, unknown> = {}) {
  log.length = 0
  target = document.createElement("div")
  document.body.append(target)
  app = mount(App, {
    target,
    props: { log: (entry: string) => log.push(entry), ...props },
  })
  await settle()
  return target
}
afterEach(() => {
  unmount(app)
  target.remove()
})

test("a user's handler runs before the core's", async () => {
  await render()
  const trigger = target.querySelector<HTMLElement>(
    '[data-slot="collapsible-trigger"]'
  )!
  trigger.click()
  await settle()
  expect(log).toEqual(["user:click", "core:true"])
  expect(trigger.getAttribute("aria-expanded")).toBe("true")
})

test("preventDefault() in a user's handler skips the core's", async () => {
  await render({ prevent: true })
  const trigger = target.querySelector<HTMLElement>(
    '[data-slot="collapsible-trigger"]'
  )!
  trigger.click()
  await settle()
  expect(log).toEqual(["user:click"])
  expect(trigger.getAttribute("aria-expanded")).toBe("false")
})

test("user handlers for events the core handles and for others both run", async () => {
  await render()
  const trigger = target.querySelector<HTMLElement>(
    '[data-slot="collapsible-trigger"]'
  )!
  trigger.dispatchEvent(
    new KeyboardEvent("keydown", { key: "a", bubbles: true })
  )
  trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
  expect(log).toEqual(["user:keydown", "user:pointerdown"])
})

test("Escape in a nested popup closes only the innermost one", async () => {
  await render()
  const triggers = () => [
    ...target.querySelectorAll<HTMLElement>('[data-slot="popover-trigger"]'),
  ]
  triggers()[0].click()
  await settle()
  byLabel("Outer")!
    .querySelector<HTMLElement>('[data-slot="popover-trigger"]')!
    .click()
  await settle()
  expect(byLabel("Inner")).not.toBeNull()
  byLabel("Inner")!.querySelector("button")!.focus()
  press("Escape")
  await settle()
  expect(byLabel("Inner")).toBeNull()
  expect(byLabel("Outer")).not.toBeNull()
  expect(
    log.filter(
      (entry) => entry.startsWith("inner") || entry.startsWith("outer")
    )
  ).toEqual(["outer:true", "inner:true", "inner:false"])
  press("Escape")
  await settle()
  expect(byLabel("Outer")).toBeNull()
})
