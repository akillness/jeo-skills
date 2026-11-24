import { render } from "@solidjs/web"
import { createSignal, flush, For } from "solid-js"
import { afterEach, expect, test } from "vitest"
import { Tabs, TabsList, TabsTab } from "../src/tabs"

let dispose = () => {}

afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

test("tabs reversed in place keep arrow keys moving through every tab", () => {
  const [values, setValues] = createSignal(["one", "two", "three"])
  const root = document.body.appendChild(document.createElement("div"))
  dispose = render(
    () => (
      <Tabs defaultValue="one">
        <TabsList aria-label="Numbers">
          <For each={values()} keyed={false}>
            {(value) => <TabsTab value={value()}>{value()}</TabsTab>}
          </For>
        </TabsList>
      </Tabs>
    ),
    root
  )
  flush()
  setValues(["three", "two", "one"])
  flush()
  const tabs = [...root.querySelectorAll<HTMLElement>('[role="tab"]')]
  tabs[0]!.click()
  tabs[0]!.focus()
  flush()
  const reached: string[] = []
  for (let i = 0; i < 3; i++) {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    )
    flush()
    reached.push(document.activeElement!.textContent!)
  }
  expect(reached).toEqual(["two", "one", "three"])
})
