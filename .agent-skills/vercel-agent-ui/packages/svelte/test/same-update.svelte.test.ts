// A bound value shows in the same update as the app's own state, so an app
// `$effect` on it, like one focusing what opened, finds the panel.
import { flushSync, mount, unmount } from "svelte"
import { expect, test } from "vitest"
import App from "./apps/collapsible-bound-app.svelte"

test("an app effect on a bound `open` sees the panel it opened", () => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  const target = document.createElement("div")
  document.body.append(target)
  const seen: string[] = []
  const app = mount(App, { target, props: { seen } })
  flushSync()
  app.set(true)
  flushSync()
  expect(seen).toEqual(["false false", "true true"])
  // A press writes back to the variable, and the effect sees the panel go.
  target.querySelector("button")!.click()
  flushSync()
  expect(seen.at(-1)).toBe("false false")
  unmount(app)
  target.remove()
})
