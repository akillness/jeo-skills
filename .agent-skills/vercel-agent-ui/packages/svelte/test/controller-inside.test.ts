// A trigger given a controller connects to that controller's component, even
// inside another component of the same kind, once that one mounts.
import { createDialogController } from "@ui-sdk/core/dialog"
import { createDrawerController } from "@ui-sdk/core/drawer"
import { createFileInputController } from "@ui-sdk/core/file-input"
import { createHoverCardController } from "@ui-sdk/core/hover-card"
import { createMenuController } from "@ui-sdk/core/menu"
import { createPopoverController } from "@ui-sdk/core/popover"
import { createSelectController } from "@ui-sdk/core/select"
import { createTooltipController } from "@ui-sdk/core/tooltip"
import { flushSync, mount, unmount, type Component } from "svelte"
import { afterEach, describe, expect, test, vi } from "vitest"
import { Dialog, DialogContent, DialogTrigger } from "../src/dialog"
import { Drawer, DrawerTrigger } from "../src/drawer"
import { HoverCard, HoverCardTrigger } from "../src/hover-card"
import { Menu, MenuContextTrigger, MenuTrigger } from "../src/menu"
import { Popover, PopoverContent, PopoverTrigger } from "../src/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "../src/tooltip"
import FileInputApp from "./apps/controller-inside-file-input-app.svelte"
import SelectApp from "./apps/controller-inside-select-app.svelte"
import App from "./apps/controller-inside-app.svelte"

HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let app: ReturnType<typeof mount> | undefined
afterEach(() => {
  if (app) {
    unmount(app)
  }
  app = undefined
  document.body.replaceChildren()
})

function render(component: Component<any>, props: Record<string, unknown>) {
  const target = document.body.appendChild(document.createElement("div"))
  app = mount(component, { target, props })
  flushSync()
  return target
}

// Lets the controllers register and core's microtasks run, then renders.
const settle = async () => {
  await new Promise((done) => setTimeout(done, 20))
  flushSync()
}

type Controller = { open: () => void; isOpen: () => boolean }
type Case = {
  name: string
  root: Component<any>
  trigger: Component<any>
  controller: () => Controller
  // What the trigger shows once the popup its controller names opens, and that popup's content.
  opened?: (el: Element) => boolean
  content?: Component<any>
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
    root,
    trigger,
    controller,
    opened = (el) => el.hasAttribute("data-open"),
    content,
  }) => {
    test("connects to the one its controller names", async () => {
      const around = controller()
      const other = controller()
      const view = render(App, { root, trigger, content, around, other })
      await settle()
      other.open()
      await settle()
      expect(opened(view.querySelector("#trigger")!)).toBe(true)
      expect(around.isOpen()).toBe(false)
    })
  }
)

test.each([
  {
    name: "dialog",
    root: Dialog,
    trigger: DialogTrigger,
    content: DialogContent,
    controller: createDialogController,
  },
  {
    name: "popover",
    root: Popover,
    trigger: PopoverTrigger,
    content: PopoverContent,
    controller: createPopoverController,
  },
])(
  "a $name trigger inside one $name opens the one its controller names",
  async ({ controller, ...parts }) => {
    const around = controller()
    const other = controller()
    const view = render(App, { ...parts, around, other })
    await settle()
    const trigger = view.querySelector<HTMLElement>("#trigger")!
    trigger.click()
    await settle()
    expect({ other: other.isOpen(), around: around.isOpen() }).toEqual({
      other: true,
      around: false,
    })
    expect(trigger.getAttribute("aria-controls")).toBe("other-content")
  }
)

test("a select trigger inside one select shows the value of the select its controller names", async () => {
  const view = render(SelectApp, { other: createSelectController<string>() })
  await settle()
  expect(view.querySelector("#trigger")!.textContent).toBe("banana")
})

test("a file input trigger inside one file input opens the picker of the one its controller names", async () => {
  const view = render(FileInputApp, { other: createFileInputController() })
  await settle()
  const picked: string[] = []
  const pick = vi
    .spyOn(HTMLInputElement.prototype, "click")
    .mockImplementation(function (this: HTMLInputElement) {
      picked.push(this.name)
    })
  view.querySelector<HTMLElement>("#trigger")!.click()
  pick.mockRestore()
  expect(picked).toEqual(["other"])
})

test("a trigger inside its own popover, given that popover's controller, keeps its element and focus", async () => {
  const shared = createPopoverController()
  const view = render(App, {
    root: Popover,
    trigger: PopoverTrigger,
    around: shared,
    other: shared,
  })
  const trigger = view.querySelector<HTMLElement>("#trigger")!
  trigger.focus()
  await settle()
  expect(view.querySelector("#trigger")).toBe(trigger)
  expect(document.activeElement).toBe(trigger)
})
