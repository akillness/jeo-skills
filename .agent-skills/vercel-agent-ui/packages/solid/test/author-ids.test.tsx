// An id passed to a part is its element's, and every reference to the part points at it.
import { createSignal, flush } from "solid-js"
import { render } from "@solidjs/web"
import { afterEach, expect, test } from "vitest"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../src/dialog"
import { Tabs, TabsList, TabsPanel, TabsTab } from "../src/tabs"
import { Toolbar, ToolbarLink } from "../src/toolbar"

HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let dispose = () => {}

async function mount(code: () => any) {
  const root = document.body.appendChild(document.createElement("div"))
  dispose = render(code, root)
  flush()
  await new Promise((resolve) => setTimeout(resolve, 10))
  flush()
  return root
}

afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

test("a dialog's parts keep the ids passed to them, and the dialog points at them", async () => {
  const root = await mount(() => (
    <Dialog defaultOpen modal={false}>
      <DialogTrigger id="mine">Edit</DialogTrigger>
      <DialogContent id="sheet">
        <DialogTitle id="heading">Profile</DialogTitle>
        <DialogDescription id="hint">Change it.</DialogDescription>
      </DialogContent>
    </Dialog>
  ))
  const trigger = root.querySelector("button")!
  const content = document.querySelector<HTMLElement>('[role="dialog"]')!
  expect(trigger.id).toBe("mine")
  expect(content.id).toBe("sheet")
  expect(document.querySelector("h2")!.id).toBe("heading")
  expect(document.querySelector("p")!.id).toBe("hint")
  expect(trigger.getAttribute("aria-controls")).toBe("sheet")
  expect(content.getAttribute("aria-labelledby")).toBe("heading")
  expect(content.getAttribute("aria-describedby")).toBe("hint")
})

test("a tab keeps the id passed to it, and its panel is labelled by it", async () => {
  const root = await mount(() => (
    <Tabs defaultValue="a">
      <TabsList aria-label="Settings">
        <TabsTab value="a" id="account">
          Account
        </TabsTab>
      </TabsList>
      <TabsPanel value="a">A</TabsPanel>
    </Tabs>
  ))
  const tab = root.querySelector<HTMLElement>('[role="tab"]')!
  const panel = root.querySelector<HTMLElement>('[role="tabpanel"]')!
  expect(tab.id).toBe("account")
  expect(panel.getAttribute("aria-labelledby")).toBe("account")
  expect(tab.getAttribute("aria-controls")).toBe(panel.id)
})

test("a tab's panel follows the id passed to the tab as it changes", async () => {
  const [id, setId] = createSignal("first")
  const root = await mount(() => (
    <Tabs defaultValue="a">
      <TabsList aria-label="Settings">
        <TabsTab value="a" id={id()}>
          Account
        </TabsTab>
      </TabsList>
      <TabsPanel value="a">A</TabsPanel>
    </Tabs>
  ))
  setId("second")
  flush()
  await new Promise((resolve) => setTimeout(resolve, 10))
  flush()
  expect(root.querySelector('[role="tab"]')!.id).toBe("second")
  expect(
    root.querySelector('[role="tabpanel"]')!.getAttribute("aria-labelledby")
  ).toBe("second")
})

test("a part whose key is its id keeps the id on its element", async () => {
  const root = await mount(() => (
    <Toolbar aria-label="Formatting">
      <ToolbarLink id="docs" href="#docs">
        Docs
      </ToolbarLink>
    </Toolbar>
  ))
  expect(root.querySelector("a")!.id).toBe("docs")
})
