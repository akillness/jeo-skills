// @vitest-environment jsdom
// An id passed to a part is its element's, and every reference to the part points at it.
import * as React from "react"
import { createRoot, hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, expect, test, vi } from "vitest"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../src/dialog"
import { Tabs, TabsList, TabsPanel, TabsTab } from "../src/tabs"
import { Toolbar, ToolbarLink } from "../src/toolbar"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let root: Root | undefined

async function render(element: React.ReactNode) {
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () => root!.render(element))
  return container
}

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

test("a dialog's parts keep the ids passed to them, and the dialog points at them", async () => {
  const view = await render(
    <Dialog defaultOpen modal={false}>
      <DialogTrigger id="mine">Edit</DialogTrigger>
      <DialogContent id="sheet">
        <DialogTitle id="heading">Profile</DialogTitle>
        <DialogDescription id="hint">Change it.</DialogDescription>
      </DialogContent>
    </Dialog>
  )
  const trigger = view.querySelector("button")!
  const content = document.querySelector<HTMLElement>('[role="dialog"]')!
  expect(trigger.id).toBe("mine")
  expect(content.id).toBe("sheet")
  expect(document.querySelector("h2")!.id).toBe("heading")
  expect(document.querySelector("p")!.id).toBe("hint")
  expect(trigger.getAttribute("aria-controls")).toBe("sheet")
  expect(content.getAttribute("aria-labelledby")).toBe("heading")
  expect(content.getAttribute("aria-describedby")).toBe("hint")
})

test("a dialog's content is labelled by the id passed to its title, which renders after it", async () => {
  await render(
    <Dialog defaultOpen modal={false}>
      <DialogContent>
        <DialogTitle id="heading">Profile</DialogTitle>
      </DialogContent>
    </Dialog>
  )
  expect(
    document.querySelector('[role="dialog"]')!.getAttribute("aria-labelledby")
  ).toBe("heading")
})

test("a tab keeps the id passed to it, and its panel is labelled by it", async () => {
  const view = await render(
    <Tabs defaultValue="a">
      <TabsList aria-label="Settings">
        <TabsTab value="a" id="account">
          Account
        </TabsTab>
      </TabsList>
      <TabsPanel value="a">A</TabsPanel>
    </Tabs>
  )
  const tab = view.querySelector<HTMLElement>('[role="tab"]')!
  const panel = view.querySelector<HTMLElement>('[role="tabpanel"]')!
  expect(tab.id).toBe("account")
  expect(panel.getAttribute("aria-labelledby")).toBe("account")
  expect(tab.getAttribute("aria-controls")).toBe(panel.id)
})

test("a part whose key is its id keeps the id on its element", async () => {
  const view = await render(
    <Toolbar aria-label="Formatting">
      <ToolbarLink id="docs" href="#docs">
        Docs
      </ToolbarLink>
    </Toolbar>
  )
  expect(view.querySelector("a")!.id).toBe("docs")
})

test("a tab's panel follows the id passed to the tab as it changes or goes", async () => {
  const view = (id?: string) => (
    <Tabs defaultValue="a">
      <TabsList aria-label="Settings">
        <TabsTab value="a" id={id}>
          Account
        </TabsTab>
      </TabsList>
      <TabsPanel value="a">A</TabsPanel>
    </Tabs>
  )
  const container = await render(view("first"))
  const tab = container.querySelector<HTMLElement>('[role="tab"]')!
  const panel = container.querySelector<HTMLElement>('[role="tabpanel"]')!
  await React.act(async () => root!.render(view("second")))
  expect(tab.id).toBe("second")
  expect(panel.getAttribute("aria-labelledby")).toBe("second")
  await React.act(async () => root!.render(view()))
  expect(tab.id).toMatch(/-tab-a$/)
  expect(panel.getAttribute("aria-labelledby")).toBe(tab.id)
})

test("a dialog hydrated from server HTML matches it, then points at the ids passed to its parts", async () => {
  const app = (
    <Dialog defaultOpen modal={false}>
      <DialogTrigger id="mine">Edit</DialogTrigger>
      <DialogContent id="sheet">
        <DialogTitle id="heading">Profile</DialogTitle>
      </DialogContent>
    </Dialog>
  )
  const container = document.body.appendChild(document.createElement("div"))
  container.innerHTML = renderToString(app)
  const errors = vi.spyOn(console, "error").mockImplementation(() => {})
  await React.act(async () => {
    root = hydrateRoot(container, app)
  })
  errors.mockRestore()
  expect(errors).not.toHaveBeenCalled()
  const content = document.querySelector<HTMLElement>('[role="dialog"]')!
  expect(container.querySelector("button")!.getAttribute("aria-controls")).toBe(
    "sheet"
  )
  expect(content.getAttribute("aria-labelledby")).toBe("heading")
})

function HydratesLater({
  until,
  children,
}: {
  until?: Promise<void>
  children: React.ReactNode
}) {
  if (until) {
    React.use(until)
  }
  return children
}

test("a tab and its panel in one Suspense boundary that hydrates late match the server HTML", async () => {
  let resolve = () => {}
  const until = new Promise<void>((done) => (resolve = done))
  const app = (until?: Promise<void>) => (
    <Tabs defaultValue="a">
      <React.Suspense fallback={null}>
        <HydratesLater until={until}>
          <TabsList aria-label="Settings">
            <TabsTab value="a" id="account">
              Account
            </TabsTab>
          </TabsList>
          <TabsPanel value="a">A</TabsPanel>
        </HydratesLater>
      </React.Suspense>
    </Tabs>
  )
  const container = document.body.appendChild(document.createElement("div"))
  container.innerHTML = renderToString(app())
  const errors = vi.spyOn(console, "error").mockImplementation(() => {})
  await React.act(async () => {
    root = hydrateRoot(container, app(until))
  })
  await React.act(async () => resolve())
  errors.mockRestore()
  expect(errors).not.toHaveBeenCalled()
  expect(
    container
      .querySelector('[role="tabpanel"]')!
      .getAttribute("aria-labelledby")
  ).toBe("account")
})
