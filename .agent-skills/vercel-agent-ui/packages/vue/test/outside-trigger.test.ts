// @vitest-environment jsdom
// A trigger outside its component, connected through a controller, renders one
// element from its first render on: binding to the component, or to another
// one, keeps the element, the app's ref to it and the focus on it.
import { afterEach, describe, expect, test, vi } from "vitest"
import { renderToString } from "@vue/server-renderer"
import {
  createApp,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  shallowRef,
  type App,
  type Component,
} from "vue"
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
  TooltipShortcut,
  TooltipTrigger,
} from "../src/tooltip"

Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let app: App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

function mount(render: () => unknown) {
  const el = document.body.appendChild(document.createElement("div"))
  app = createApp(defineComponent({ setup: () => render }))
  app.mount(el)
  return el
}

const wait = () => new Promise((done) => setTimeout(done, 10))

// What the trigger looks like once it's bound to its component.
type Case = {
  name: string
  root: Component
  trigger: Component
  controller: () => object
  bound: (el: Element) => boolean
  attrs?: Record<string, unknown>
  // What it shows once the popup its controller names opens, and that popup's content.
  opened?: (el: Element) => boolean
  content?: Component
}

const popupOf = (role: string) => (el: Element) =>
  el.getAttribute("aria-haspopup") === role
const cases: Case[] = [
  {
    name: "dialog",
    root: Dialog,
    trigger: DialogTrigger,
    controller: createDialogController,
    bound: popupOf("dialog"),
  },
  {
    name: "drawer",
    root: Drawer,
    trigger: DrawerTrigger,
    controller: createDrawerController,
    bound: popupOf("dialog"),
  },
  {
    name: "popover",
    root: Popover,
    trigger: PopoverTrigger,
    controller: createPopoverController,
    bound: popupOf("dialog"),
  },
  {
    name: "menu",
    root: Menu,
    trigger: MenuTrigger,
    controller: createMenuController,
    bound: popupOf("menu"),
  },
  {
    name: "context menu",
    root: Menu,
    trigger: MenuContextTrigger,
    controller: createMenuController,
    bound: (el) => el.hasAttribute("data-slot"),
    attrs: { tabindex: 0 },
  },
  {
    name: "tooltip",
    root: Tooltip,
    trigger: TooltipTrigger,
    controller: createTooltipController,
    bound: (el) => el.hasAttribute("data-slot"),
    opened: (el) => el.getAttribute("aria-describedby") === "other-content",
    content: TooltipContent,
  },
  {
    name: "hover card",
    root: HoverCard,
    trigger: HoverCardTrigger,
    controller: createHoverCardController,
    bound: (el) => el.hasAttribute("data-slot"),
    attrs: { href: "#profile" },
  },
  {
    name: "select",
    root: Select,
    trigger: SelectTrigger,
    controller: createSelectController,
    bound: popupOf("listbox"),
  },
  {
    name: "file input",
    root: FileInput,
    trigger: FileInputTrigger,
    controller: createFileInputController,
    bound: (el) => el.hasAttribute("data-slot"),
  },
]

describe.each(cases)(
  "a $name trigger outside its component",
  ({ root, trigger, controller, bound, attrs }) => {
    test("keeps its element, and focus, when its component mounts", async () => {
      const shared = controller()
      const shown = shallowRef(false)
      let fromRef: Element | null = null
      const ref = (component: { $el?: Element } | null) =>
        (fromRef ??= component?.$el ?? null)
      const el = mount(() => [
        h(trigger, { ...attrs, controller: shared, ref }, () => "Open"),
        shown.value && h(root, { controller: shared }),
      ])
      await wait()
      const element = el.firstElementChild as HTMLElement
      expect(bound(element)).toBe(false)
      element.focus()
      shown.value = true
      await nextTick()
      await wait()
      expect(el.firstElementChild).toBe(element)
      expect(bound(element)).toBe(true)
      expect(fromRef, "the element the app's ref got").toBe(element)
      expect(document.activeElement).toBe(element)
    })

    test("keeps its element, and focus, when its controller changes", async () => {
      const first = controller()
      const second = controller()
      const current = shallowRef(first)
      const el = mount(() => [
        h(trigger, { ...attrs, controller: current.value }, () => "Open"),
        h(root, { controller: first }),
        h(root, { controller: second }),
      ])
      await wait()
      const element = el.firstElementChild as HTMLElement
      expect(bound(element)).toBe(true)
      element.focus()
      current.value = second
      await nextTick()
      await wait()
      expect(el.firstElementChild).toBe(element)
      expect(document.activeElement).toBe(element)
    })
  }
)

describe.each(
  cases.filter((each) => each.name !== "select" && each.name !== "file input")
)(
  "a $name trigger inside another $name",
  ({
    root,
    trigger,
    controller,
    attrs,
    opened = (el) => el.hasAttribute("data-open"),
    content,
  }) => {
    test("connects to the one its controller names", async () => {
      const around = controller() as { isOpen: () => boolean }
      const other = controller() as { open: () => void }
      const el = mount(() => [
        h(root, { controller: around }, () =>
          h(
            trigger,
            { ...attrs, controller: other, id: "trigger" },
            () => "Open"
          )
        ),
        h(
          root,
          { controller: other },
          () => content && h(content, { id: "other-content" })
        ),
      ])
      await wait()
      other.open()
      await wait()
      expect(opened(el.querySelector("#trigger")!)).toBe(true)
      expect(around.isOpen()).toBe(false)
    })
  }
)

test("a dialog trigger inside one dialog opens the dialog its controller names", async () => {
  const around = createDialogController()
  const other = createDialogController()
  const el = mount(() => [
    h(Dialog, { controller: around }, () =>
      h(DialogTrigger, { controller: other, id: "trigger" }, () => "Open")
    ),
    h(Dialog, { controller: other }, () =>
      h(DialogContent, { id: "other-content" })
    ),
  ])
  await wait()
  const element = el.querySelector<HTMLElement>("#trigger")!
  element.click()
  await wait()
  expect({ other: other.isOpen(), around: around.isOpen() }).toEqual({
    other: true,
    around: false,
  })
  expect(element.getAttribute("aria-controls")).toBe("other-content")
})

test("a file input trigger inside one file input opens the picker of the one its controller names", async () => {
  const other = createFileInputController()
  const el = mount(() => [
    h(FileInput, { name: "around" }, () =>
      h(FileInputTrigger, { controller: other, id: "trigger" }, () => "Browse")
    ),
    h(FileInput, { controller: other, name: "other" }),
  ])
  await wait()
  const picked: string[] = []
  const pick = vi
    .spyOn(HTMLInputElement.prototype, "click")
    .mockImplementation(function (this: HTMLInputElement) {
      picked.push(this.name)
    })
  el.querySelector<HTMLElement>("#trigger")!.click()
  pick.mockRestore()
  expect(picked).toEqual(["other"])
})

test("a trigger inside its own dialog, given that dialog's controller, hydrates as rendered and stays bound", async () => {
  const shared = createDialogController()
  const view = () =>
    h(Dialog, { controller: shared }, () =>
      h(DialogTrigger, { controller: shared }, () => "Open")
    )
  const container = document.body.appendChild(document.createElement("div"))
  container.innerHTML = await renderToString(createSSRApp(view))
  const element = container.firstElementChild as HTMLElement
  const html = element.outerHTML
  const warnings: string[] = []
  app = createSSRApp(view)
  app.config.warnHandler = (message) => warnings.push(message)
  app.mount(container)
  element.focus()
  await wait()
  expect(warnings).toEqual([])
  expect(container.firstElementChild).toBe(element)
  expect(element.outerHTML).toBe(html)
  expect(document.activeElement).toBe(element)
})

test("a trigger inside one dialog, given another's controller, hydrates as rendered and then binds to the other", async () => {
  const other = createDialogController()
  const view = () => [
    h(Dialog, null, () =>
      h(DialogTrigger, { controller: other, id: "trigger" }, () => "Open")
    ),
    h(Dialog, { controller: other }, () =>
      h(DialogContent, { id: "other-content" })
    ),
  ]
  const container = document.body.appendChild(document.createElement("div"))
  container.innerHTML = await renderToString(createSSRApp(() => view()))
  const element = container.querySelector<HTMLElement>("#trigger")!
  const warnings: string[] = []
  app = createSSRApp(() => view())
  app.config.warnHandler = (message) => warnings.push(message)
  app.mount(container)
  await wait()
  other.open()
  await wait()
  expect(warnings).toEqual([])
  expect(container.querySelector("#trigger")).toBe(element)
  expect(element.getAttribute("aria-controls")).toBe("other-content")
})

test("a tooltip shortcut inside a trigger shows the shortcut of the tooltip its controller switches to", async () => {
  const first = createTooltipController()
  const second = createTooltipController()
  const current = shallowRef(first)
  const el = mount(() => [
    h(Tooltip, { controller: first, shortcut: "mod+a" }),
    h(Tooltip, { controller: second, shortcut: "mod+b" }),
    h(TooltipTrigger, { controller: current.value }, () => [
      "Open ",
      h(TooltipShortcut),
    ]),
  ])
  await wait()
  const element = el.querySelector("button")!
  expect(element.textContent).toContain("Ctrl+A")
  current.value = second
  await nextTick()
  await wait()
  expect(element.getAttribute("aria-keyshortcuts")).toBe("Control+B")
  expect(element.textContent).toContain("Ctrl+B")
})

describe("a select trigger outside its select with a value inside", () => {
  const withValue = {
    "its default slot": () => h(SelectValue, { placeholder: "Pick one" }),
    "its render slot": {
      render: ({ props }: { props: Record<string, unknown> }) =>
        h("button", props, h(SelectValue, { placeholder: "Pick one" })),
    },
  }

  test.each(Object.entries(withValue))(
    "shows the placeholder until the select mounts, then the value, in %s",
    async (_, content) => {
      const shared = createSelectController()
      const shown = shallowRef(false)
      const el = mount(() => [
        h(SelectTrigger, { controller: shared }, content),
        shown.value &&
          h(Select, {
            controller: shared,
            items: ["apple", "banana"],
            defaultValue: "banana",
          }),
      ])
      await wait()
      const element = el.firstElementChild as HTMLElement
      expect(element.textContent).toBe("Pick one")
      shown.value = true
      await nextTick()
      await wait()
      expect(el.firstElementChild).toBe(element)
      expect(element.textContent).toBe("banana")
    }
  )
})

test("a select trigger inside one select connects to the select its controller names", async () => {
  const other = createSelectController()
  const el = mount(() => [
    h(Select, { items: ["apple", "banana"], defaultValue: "apple" }, () =>
      h(SelectTrigger, { controller: other, id: "trigger" }, () =>
        h(SelectValue)
      )
    ),
    h(Select, {
      controller: other,
      items: ["apple", "banana"],
      defaultValue: "banana",
    }),
  ])
  await wait()
  expect(el.querySelector("#trigger")!.textContent).toBe("banana")
})
