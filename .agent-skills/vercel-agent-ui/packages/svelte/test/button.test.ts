import { flushSync, mount, unmount } from "svelte"
import { expect, test } from "vitest"
import { withSource } from "../src/observe"
import App from "./apps/button-app.svelte"

test("a press hands the handler its event and how the button was pressed", () => {
  const log: string[] = []
  const target = document.body.appendChild(document.createElement("div"))
  const app = mount(App, {
    target,
    props: { log: (entry: string) => log.push(entry) },
  })
  flushSync()
  withSource("agent", () => target.querySelector("button")!.click())
  expect(log).toEqual(["click:agent"])
  unmount(app)
  target.remove()
})
