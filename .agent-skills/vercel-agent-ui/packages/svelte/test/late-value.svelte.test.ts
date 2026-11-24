// A bound value that starts empty drives the component once it holds one,
// the way `bind:` works everywhere else in Svelte: set later by the parent,
// or saved from a press by a function binding, which then decides every
// change after it.
import { flushSync, mount, unmount } from "svelte"
import { expect, test } from "vitest"
import App from "./apps/tabs-late-value-app.svelte"
import RefusingApp from "./apps/tabs-refusing-binding-app.svelte"

test("a bound value set after mount selects its tab", async () => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  const target = document.createElement("div")
  document.body.append(target)
  const props = $state({
    api: undefined as unknown as {
      set: (value: string) => void
      get: () => unknown
    },
  })
  const app = mount(App, { target, props })
  flushSync()
  const panel = () => target.querySelector('[role="tabpanel"]')?.textContent
  expect(panel()).toBe("A panel")
  props.api.set("b")
  flushSync()
  expect(panel()).toBe("B panel")
  // A press writes back to the variable, which keeps driving it.
  target.querySelectorAll<HTMLElement>('[role="tab"]')[0].click()
  flushSync()
  expect(props.api.get()).toBe("a")
  expect(panel()).toBe("A panel")
  props.api.set("b")
  flushSync()
  expect(panel()).toBe("B panel")
  unmount(app)
  target.remove()
})

test("a function binding that starts empty and saved one change still refuses the next", () => {
  const target = document.createElement("div")
  document.body.append(target)
  const props = $state({
    api: undefined as unknown as { refuse: () => void; get: () => unknown },
  })
  const app = mount(RefusingApp, { target, props })
  flushSync()
  const tab = (name: string) =>
    [...target.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (el) => el.textContent === name
    )!
  const panel = () =>
    target.querySelector('[role="tabpanel"]:not([hidden])')?.textContent
  tab("Beta").click()
  flushSync()
  expect(props.api.get()).toBe("b")
  props.api.refuse()
  tab("Alpha").click()
  flushSync()
  expect(props.api.get()).toBe("b")
  expect(tab("Beta").getAttribute("aria-selected")).toBe("true")
  expect(panel()).toBe("B panel")
  unmount(app)
  target.remove()
})
