// A trigger given a controller connects to that controller's component, even
// inside another component of the same kind, once that one mounts.
import { render } from "@solidjs/web"
import { createSignal, flush, For, type Component } from "solid-js"
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

HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.replaceChildren()
})

function mount(code: () => any) {
  const root = document.body.appendChild(document.createElement("div"))
  dispose = render(code, root)
  flush()
  return root
}

// Lets the controllers register and core's microtasks run, then renders.
const settle = async () => {
  await new Promise((done) => setTimeout(done, 10))
  flush()
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
    root: Root,
    trigger: Trigger,
    controller,
    opened = (el) => el.hasAttribute("data-open"),
    content: Content,
  }) => {
    test("connects to the one its controller names", async () => {
      const around = controller()
      const other = controller()
      const view = mount(() => (
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
      ))
      await settle()
      other.open()
      await settle()
      expect(opened(view.querySelector("#trigger")!)).toBe(true)
      expect(around.isOpen()).toBe(false)
    })
  }
)

test("a dialog trigger inside one dialog opens the dialog its controller names", async () => {
  const around = createDialogController()
  const other = createDialogController()
  const view = mount(() => (
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
  ))
  await settle()
  const trigger = view.querySelector<HTMLElement>("#trigger")!
  trigger.click()
  await settle()
  expect({ other: other.isOpen(), around: around.isOpen() }).toEqual({
    other: true,
    around: false,
  })
  expect(trigger.getAttribute("aria-controls")).toBe("other-content")
})

test("a popover trigger inside one popover opens the popover its controller names", async () => {
  const around = createPopoverController()
  const other = createPopoverController()
  const view = mount(() => (
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
  ))
  await settle()
  const trigger = view.querySelector<HTMLElement>("#trigger")!
  trigger.click()
  await settle()
  expect({ other: other.isOpen(), around: around.isOpen() }).toEqual({
    other: true,
    around: false,
  })
  expect(trigger.getAttribute("aria-controls")).toBe("other-content")
})

test("a select trigger inside one select shows the value of the select its controller names", async () => {
  const other = createSelectController<string>()
  const view = mount(() => (
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
  ))
  await settle()
  expect(view.querySelector("#trigger")!.textContent).toBe("banana")
})

test("a select trigger inside one select shows the placeholder of the select its controller names", async () => {
  const other = createSelectController<string>()
  const view = mount(() => (
    <>
      <Select items={["apple", "banana"]} placeholder="Around">
        <SelectTrigger controller={other} id="trigger">
          <SelectValue />
        </SelectTrigger>
      </Select>
      <Select
        controller={other}
        items={["apple", "banana"]}
        placeholder="Other"
      />
    </>
  ))
  await settle()
  expect(view.querySelector("#trigger")!.textContent).toBe("Other")
})

test("a file input trigger inside one file input opens the picker of the one its controller names", async () => {
  const other = createFileInputController()
  const view = mount(() => (
    <>
      <FileInput name="around">
        <FileInputTrigger controller={other} id="trigger">
          Browse
        </FileInputTrigger>
      </FileInput>
      <FileInput controller={other} name="other" />
    </>
  ))
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
  const view = mount(() => (
    <Popover controller={shared}>
      <PopoverTrigger controller={shared}>Open</PopoverTrigger>
    </Popover>
  ))
  const trigger = view.querySelector("button")!
  trigger.focus()
  await settle()
  expect(view.querySelector("button")).toBe(trigger)
  expect(document.activeElement).toBe(trigger)
})

test("removing a row whose trigger names a menu's controller leaves the menu working", async () => {
  const menu = createMenuController()
  const [rows, setRows] = createSignal(["a", "b"])
  const view = mount(() => (
    <>
      <For each={rows()}>
        {(row) => <MenuTrigger controller={menu}>{row}</MenuTrigger>}
      </For>
      <Menu controller={menu} />
    </>
  ))
  await settle()
  setRows(["b"])
  expect(() => flush()).not.toThrow()
  await settle()
  expect(
    [...view.querySelectorAll("button")].map((button) => button.textContent)
  ).toEqual(["b"])
})
