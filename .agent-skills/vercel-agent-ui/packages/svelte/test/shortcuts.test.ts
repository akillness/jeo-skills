import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import App from "./apps/shortcuts-app.svelte"

const byLabel = (label: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${label}"]`)
const pressK = () =>
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
  )

let target: HTMLElement
let app: ReturnType<typeof mount> | undefined
let presses = 0
function render(props: Record<string, unknown> = {}) {
  presses = 0
  target = document.createElement("div")
  document.body.append(target)
  app = mount(App, { target, props: { onPress: () => presses++, ...props } })
  flushSync()
}
afterEach(() => {
  if (app) {
    unmount(app)
  }
  app = undefined
  target.remove()
})

test("a shortcut runs while the component is mounted, and stops with it", () => {
  render()
  pressK()
  expect(presses).toBe(1)
  unmount(app!)
  app = undefined
  pressK()
  expect(presses).toBe(1)
})

test("null keys register nothing", () => {
  render({ keys: null })
  pressK()
  expect(presses).toBe(0)
})

test("the hint formats the keys for the platform, with aria-keyshortcuts", () => {
  render()
  expect(byLabel("hint")?.textContent).toContain("Ctrl+K")
  expect(byLabel("aria")?.textContent).toBe("Control+K")
})
