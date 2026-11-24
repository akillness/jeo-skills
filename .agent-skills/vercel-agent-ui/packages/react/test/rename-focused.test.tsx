// @vitest-environment jsdom
// A focused item whose value changes keeps the tab stop: the tabs pattern puts
// it on the selected tab, the radio group pattern on the checked radio.
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { Radio, RadioGroup } from "../src/radio"
import { Tabs, TabsList, TabsPanel, TabsTab } from "../src/tabs"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.getAnimations ??= () => []

let root: Root | undefined
afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

async function render(element: React.ReactNode) {
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () => root!.render(element))
  return container
}

async function rename(set: (value: string) => void) {
  await React.act(async () => set("b2"))
  await React.act(() => new Promise((done) => setTimeout(done, 20)))
}

test("the selected tab keeps the tab stop when its value changes while it has focus", async () => {
  let set!: (value: string) => void
  function App() {
    const [value, setValue] = React.useState("b")
    set = setValue
    return (
      <Tabs value={value} onValueChange={() => {}}>
        <TabsList aria-label="Settings">
          <TabsTab value="a">A</TabsTab>
          <TabsTab value={value}>B</TabsTab>
          <TabsTab value="c">C</TabsTab>
        </TabsList>
        <TabsPanel value={value}>B</TabsPanel>
      </Tabs>
    )
  }
  const view = await render(<App />)
  const tabs = [...view.querySelectorAll<HTMLElement>('[role="tab"]')]
  await React.act(async () => tabs[1].focus())
  await rename(set)
  expect(document.activeElement).toBe(tabs[1])
  expect(tabs[1].getAttribute("aria-selected")).toBe("true")
  expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1])
})

test("the checked radio keeps the tab stop when its value changes while it has focus", async () => {
  let set!: (value: string) => void
  function App() {
    const [value, setValue] = React.useState("b")
    set = setValue
    return (
      <RadioGroup value={value} onValueChange={() => {}} aria-label="Size">
        <Radio value="a" aria-label="A" />
        <Radio value={value} aria-label="B" />
        <Radio value="c" aria-label="C" />
      </RadioGroup>
    )
  }
  const view = await render(<App />)
  const radios = [...view.querySelectorAll<HTMLElement>('[role="radio"]')]
  await React.act(async () => radios[1].focus())
  await rename(set)
  expect(radios[1].getAttribute("aria-checked")).toBe("true")
  expect(radios.map((radio) => radio.tabIndex)).toEqual([-1, 0, -1])
})
