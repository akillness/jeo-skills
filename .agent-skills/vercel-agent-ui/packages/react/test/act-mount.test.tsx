// @vitest-environment jsdom
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test, vi } from "vitest"
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemText,
  ComboboxLabel,
  ComboboxList,
} from "../src/combobox"
import { Button } from "../src/button"
import { Field, FieldError, FieldLabel } from "../src/field"
import { Input } from "../src/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectLabel,
  SelectList,
  SelectTrigger,
  SelectValue,
} from "../src/select"
import { Tabs, TabsList, TabsPanel, TabsTab } from "../src/tabs"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

// Testing Library's `render` mounts in a synchronous act().
async function updatesAfterMounting(ui: React.ReactNode) {
  const error = vi.spyOn(console, "error").mockImplementation(() => {})
  root = createRoot(document.body.appendChild(document.createElement("div")))
  act(() => root!.render(ui))
  await new Promise((resolve) => setTimeout(resolve, 20))
  return error.mock.calls
    .filter(([message]) => String(message).includes("not wrapped in act("))
    .map(([, component]) => component)
}

const select = (open: boolean) => (
  <Select defaultOpen={open}>
    <SelectLabel>Fruit</SelectLabel>
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectList>
        <SelectItem value="apple">
          <SelectItemText>Apple</SelectItemText>
        </SelectItem>
      </SelectList>
    </SelectContent>
  </Select>
)

const combobox = (
  <Combobox items={["Apple"]}>
    <ComboboxLabel>Fruit</ComboboxLabel>
    <ComboboxInput />
    <ComboboxContent>
      <ComboboxList>
        <ComboboxItem value="Apple">
          <ComboboxItemText>Apple</ComboboxItemText>
        </ComboboxItem>
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
)

test.each([
  [
    "an input in a field",
    <Field>
      <FieldLabel>Name</FieldLabel>
      <Input />
      <FieldError>Required</FieldError>
    </Field>,
  ],
  [
    "a closed select in a field",
    <Field>
      <FieldLabel>Fruit</FieldLabel>
      {select(false)}
    </Field>,
  ],
  ["an open select", select(true)],
  ["a combobox", combobox],
])(
  "mounting %s in a synchronous act() leaves no updates for after it",
  async (_, ui) => {
    expect(await updatesAfterMounting(ui)).toEqual([])
  }
)

test("a strict mode remount keeps a tab with a button inside it selected", async () => {
  const change = vi.fn()
  root = createRoot(document.body.appendChild(document.createElement("div")))
  await act(async () =>
    root!.render(
      <React.StrictMode>
        <Tabs defaultValue="b" onValueChange={change}>
          <TabsList aria-label="Views">
            <TabsTab value="a">A</TabsTab>
            <TabsTab value="b" render={<div />}>
              B <Button>Pin</Button>
            </TabsTab>
          </TabsList>
          <TabsPanel value="a">A</TabsPanel>
          <TabsPanel value="b">B</TabsPanel>
        </Tabs>
      </React.StrictMode>
    )
  )
  expect(change).not.toHaveBeenCalled()
})
