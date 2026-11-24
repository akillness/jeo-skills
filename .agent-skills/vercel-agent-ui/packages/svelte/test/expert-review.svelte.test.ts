// Svelte's own features at the adapter's edge: native handlers in render
// snippets, function bindings and attachments on generated parts.
import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import App from "./apps/expert-review-app.svelte"

const log: string[] = []
let app: ReturnType<typeof mount> | undefined
afterEach(() => {
  if (app) {
    unmount(app)
  }
  app = undefined
  document.body.replaceChildren()
})

function render() {
  log.length = 0
  const props = $state({
    log: (entry: string) => log.push(entry),
    api: undefined as unknown as { set: (value: string) => void },
  })
  app = mount(App, { target: document.body, props })
  flushSync()
  return props
}
const button = (text: string) =>
  [...document.querySelectorAll("button")].find(
    (el) => el.textContent === text
  )!

test("a handler on a component that renders its own element runs first and can prevent the built-in click", () => {
  render()
  button("Snippet").click()
  flushSync()
  expect(log.filter((entry) => !entry.startsWith("attached"))).toEqual(["user"])
  expect(button("Snippet").getAttribute("aria-pressed")).toBe("false")
})

test("a refusing function binding set to the default after mount keeps its value", () => {
  const props = render()
  const panel = () =>
    document.querySelector('[role="tabpanel"]:not([hidden])')?.textContent
  props.api.set("a")
  flushSync()
  button("Beta").click()
  flushSync()
  expect(log).toContain("requested:b")
  expect(panel()).toBe("A panel")
})

test("generated parts take attachments like hand-written ones", () => {
  render()
  expect(log.filter((entry) => entry.startsWith("attached"))).toEqual([
    "attached:Written",
    "attached:Generated",
  ])
})
