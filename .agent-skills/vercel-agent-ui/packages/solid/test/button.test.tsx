import { render } from "@solidjs/web"
import { flush } from "solid-js"
import { afterEach, expect, test } from "vitest"
import { Button } from "../src/button"
import { withSource } from "../src/observe"

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.innerHTML = ""
})

function mount(code: () => any) {
  const root = document.createElement("div")
  document.body.append(root)
  dispose = render(code, root)
  flush()
  return root.querySelector("button")!
}

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve()
  }
  flush()
}

test("a press hands the handler how the button was pressed", () => {
  const sources: string[] = []
  const el = mount(() => (
    <Button onClick={(_event, { source }) => sources.push(source)}>Save</Button>
  ))
  withSource("agent", () => el.click())
  expect(sources).toEqual(["agent"])
})

test("Solid's bound form runs with its data, the event on the button and how it was pressed", () => {
  const calls: unknown[] = []
  const handler = (
    data: string,
    event: MouseEvent,
    details: { source: string }
  ) => calls.push(data, event.currentTarget, details.source)
  const el = mount(() => <Button onClick={[handler, "saved"]}>Save</Button>)
  withSource("keyboard", () => el.click())
  expect(calls).toEqual(["saved", el, "keyboard"])
})

test("a bound handler's Promise keeps the button pending until it settles", async () => {
  let finish = () => {}
  const wait = () => new Promise<void>((resolve) => (finish = resolve))
  const el = mount(() => <Button onClick={[wait, undefined]}>Save</Button>)
  el.click()
  await settle()
  expect(el.getAttribute("aria-busy")).toBe("true")
  finish()
  await settle()
  expect(el.hasAttribute("aria-busy")).toBe(false)
})
