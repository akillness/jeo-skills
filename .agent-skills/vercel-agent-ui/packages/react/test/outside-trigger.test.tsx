// @vitest-environment jsdom
// A trigger given a controller connects to that controller's component, even
// inside another component of the same kind, once that one mounts.
import * as React from "react"
import { createRoot, hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  createDialogController,
  Dialog,
  DialogContent,
  DialogTrigger,
} from "../src/dialog"
import { createDrawerController, Drawer, DrawerTrigger } from "../src/drawer"
import {
  createFileInputController,
  FileInput,
  FileInputTrigger,
} from "../src/file-input"
import {
  createHoverCardController,
  HoverCard,
  HoverCardTrigger,
} from "../src/hover-card"
import {
  createMenuController,
  Menu,
  MenuContextTrigger,
  MenuTrigger,
} from "../src/menu"
import {
  createPopoverController,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../src/popover"
import {
  createSelectController,
  Select,
  SelectTrigger,
  SelectValue,
} from "../src/select"
import {
  createTooltipController,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../src/tooltip"

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

// The server's HTML for `element`, in the page.
function serve(element: React.ReactNode) {
  const container = document.body.appendChild(document.createElement("div"))
  container.innerHTML = renderToString(element)
  return container
}

// Hydrates the server's HTML, and returns what React reports about it.
async function hydrate(container: HTMLElement, element: React.ReactNode) {
  const errors: unknown[] = []
  const error = vi
    .spyOn(console, "error")
    .mockImplementation((...args) => errors.push(args))
  await React.act(async () => {
    root = hydrateRoot(container, element, {
      onRecoverableError: (cause) => errors.push(cause),
    })
  })
  error.mockRestore()
  return errors
}

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

type Controller = { open: () => void; isOpen: () => boolean }
type Case = {
  name: string
  root: React.ComponentType<any>
  trigger: React.ComponentType<any>
  controller: () => Controller
  // What the trigger shows once the popup its controller names opens, and that popup's content.
  opened?: (el: Element) => boolean
  content?: React.ComponentType<any>
}

const cases: Case[] = [
  {
    name: "dialog",
    root: Dialog,
    trigger: DialogTrigger,
    controller: createDialogController,
  },
  {
    name: "drawer",
    root: Drawer,
    trigger: DrawerTrigger,
    controller: createDrawerController,
  },
  {
    name: "popover",
    root: Popover,
    trigger: PopoverTrigger,
    controller: createPopoverController,
  },
  {
    name: "menu",
    root: Menu,
    trigger: MenuTrigger,
    controller: createMenuController,
  },
  {
    name: "context menu",
    root: Menu,
    trigger: MenuContextTrigger,
    controller: createMenuController,
  },
  {
    name: "tooltip",
    root: Tooltip,
    trigger: TooltipTrigger,
    controller: createTooltipController,
    opened: (el) => el.getAttribute("aria-describedby") === "other-content",
    content: TooltipContent,
  },
  {
    name: "hover card",
    root: HoverCard,
    trigger: HoverCardTrigger,
    controller: createHoverCardController,
  },
]

describe.each(cases)(
  "a $name trigger inside another $name",
  ({
    root: Root,
    trigger: Trigger,
    controller,
    opened = (el) => el.hasAttribute("data-open"),
    content: Content,
  }) => {
    test("connects to the one its controller names", async () => {
      const around = controller()
      const other = controller()
      const view = await render(
        <>
          <Root controller={around}>
            <Trigger controller={other} id="trigger">
              Open
            </Trigger>
          </Root>
          <Root controller={other}>
            {Content && <Content id="other-content" />}
          </Root>
        </>
      )
      await React.act(async () => {
        other.open()
      })
      expect(opened(view.querySelector("#trigger")!)).toBe(true)
      expect(around.isOpen()).toBe(false)
    })
  }
)

test("a dialog trigger inside one dialog opens the dialog its controller names", async () => {
  const around = createDialogController()
  const other = createDialogController()
  const view = await render(
    <>
      <Dialog controller={around}>
        <DialogTrigger controller={other} id="trigger">
          Open
        </DialogTrigger>
      </Dialog>
      <Dialog controller={other}>
        <DialogContent id="other-content" />
      </Dialog>
    </>
  )
  const trigger = view.querySelector<HTMLElement>("#trigger")!
  await React.act(async () => trigger.click())
  expect({ other: other.isOpen(), around: around.isOpen() }).toEqual({
    other: true,
    around: false,
  })
  expect(trigger.getAttribute("aria-controls")).toBe("other-content")
})

test("a popover trigger inside one popover opens the popover its controller names", async () => {
  const around = createPopoverController()
  const other = createPopoverController()
  const view = await render(
    <>
      <Popover controller={around}>
        <PopoverTrigger controller={other} id="trigger">
          Open
        </PopoverTrigger>
      </Popover>
      <Popover controller={other}>
        <PopoverContent id="other-content" />
      </Popover>
    </>
  )
  const trigger = view.querySelector<HTMLElement>("#trigger")!
  await React.act(async () => trigger.click())
  expect({ other: other.isOpen(), around: around.isOpen() }).toEqual({
    other: true,
    around: false,
  })
  expect(trigger.getAttribute("aria-controls")).toBe("other-content")
})

test("a select trigger inside one select shows the value of the select its controller names", async () => {
  const other = createSelectController<string>()
  const view = await render(
    <>
      <Select items={["apple", "banana"]} defaultValue="apple">
        <SelectTrigger controller={other} id="trigger">
          <SelectValue />
        </SelectTrigger>
      </Select>
      <Select
        controller={other}
        items={["apple", "banana"]}
        defaultValue="banana"
      />
    </>
  )
  expect(view.querySelector("#trigger")!.textContent).toBe("banana")
})

test("a file input trigger inside one file input opens the picker of the one its controller names", async () => {
  const other = createFileInputController()
  const view = await render(
    <>
      <FileInput name="around">
        <FileInputTrigger controller={other} id="trigger">
          Browse
        </FileInputTrigger>
      </FileInput>
      <FileInput controller={other} name="other" />
    </>
  )
  const picked: string[] = []
  const pick = vi
    .spyOn(HTMLInputElement.prototype, "click")
    .mockImplementation(function (this: HTMLInputElement) {
      picked.push(this.name)
    })
  await React.act(async () =>
    view.querySelector<HTMLElement>("#trigger")!.click()
  )
  pick.mockRestore()
  expect(picked).toEqual(["other"])
})

test("a trigger inside its own dialog, given that dialog's controller, hydrates as rendered and stays bound", async () => {
  const shared = createDialogController()
  const element = (
    <Dialog controller={shared}>
      <DialogTrigger controller={shared}>Open</DialogTrigger>
    </Dialog>
  )
  const container = serve(element)
  const html = container.innerHTML
  expect(await hydrate(container, element)).toEqual([])
  expect(container.innerHTML).toBe(html)
})

test("a trigger inside one popover, given another's controller, hydrates as rendered and then binds to the other", async () => {
  const other = createPopoverController()
  const element = (
    <>
      <Popover>
        <PopoverTrigger controller={other} id="trigger">
          Open
        </PopoverTrigger>
      </Popover>
      <Popover controller={other}>
        <PopoverContent id="other-content" />
      </Popover>
    </>
  )
  const container = serve(element)
  const trigger = container.querySelector("#trigger")
  const errors = await hydrate(container, element)
  await React.act(async () => {
    other.open()
  })
  expect(errors).toEqual([])
  expect(container.querySelector("#trigger")).toBe(trigger)
  expect(trigger!.getAttribute("aria-controls")).toBe("other-content")
})
