// @vitest-environment jsdom
import { definePrimitive } from "@ui-sdk/core"
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "../src/accordion"
import { Checkbox, CheckboxGroup } from "../src/checkbox"
import { Combobox } from "../src/combobox"
import { DatePicker } from "../src/date-picker"
import { Listbox, ListboxItem, ListboxItemIndicator } from "../src/listbox"
import {
  Menu,
  MenuContent,
  MenuItemIndicator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "../src/menu"
import { usePart, usePrimitive, type PrimitiveHandle } from "../src/primitive"
import { Radio, RadioGroup, RadioIndicator } from "../src/radio"
import { Rating } from "../src/rating"
import {
  createResizableController,
  Resizable,
  ResizablePanel,
} from "../src/resizable"
import { Select } from "../src/select"
import { Separator } from "../src/separator"
import { Toggle, ToggleGroup } from "../src/toggle"
import { Toolbar } from "../src/toolbar"
import { Tree } from "../src/tree"
import { extendHandle } from "../src/use-primitive"

// A render shows the options it was given, though the instance gets them only
// once React commits it, and the state the instance has moved on to since,
// like a resizable measuring its panels.

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
// jsdom has no Web Animations API, which presence asks when a popup opens.
Element.prototype.getAnimations ??= () => []

let root: Root | undefined

async function render(element: React.ReactNode) {
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () => root!.render(element))
  return container
}

const rerender = (element: React.ReactNode) =>
  React.act(async () => root!.render(element))

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

// Records what `read` finds in the page as each render of its parent commits,
// before any render that corrects it.
function Probe({ seen, read }: { seen: unknown[]; read: () => unknown }) {
  React.useLayoutEffect(() => {
    seen.push(read())
  })
  return null
}

const submitted = () =>
  new FormData(document.querySelector("form")!).getAll("choice")

const controls = {
  Select: (value: string[]) => <Select name="choice" multiple value={value} />,
  Combobox: (value: string[]) => (
    <Combobox name="choice" multiple value={value} />
  ),
  Listbox: (value: string[]) => (
    <Listbox aria-label="Choice" name="choice" multiple value={value} />
  ),
}

test.each(Object.entries(controls))(
  "a controlled multiple %s submits each new value in the render that changes it",
  async (_name, control) => {
    const seen: unknown[] = []
    const values = [["a"], ["a", "b"], ["a", "b", "c"], ["c", "a"], ["a"], []]
    const view = (value: string[]) => (
      <>
        <form>{control(value)}</form>
        <Probe seen={seen} read={submitted} />
      </>
    )
    await render(view(values[0]))
    for (const value of values.slice(1)) {
      await rerender(view(value))
    }
    expect(seen).toEqual(values)
  }
)

const options = () => [...document.querySelectorAll('[role="option"]')]
const optionLabels = () => options().map((option) => option.textContent)

type Items = { value: string; label: string }[]

const dataLists = {
  Listbox: (items: Items) => <Listbox aria-label="Choice" items={items} />,
  Select: (items: Items) => <Select defaultOpen items={items} />,
  Combobox: (items: Items) => <Combobox defaultOpen items={items} />,
}

test.each(Object.entries(dataLists))(
  "a data %s shows its new items in the render that changes them",
  async (_name, list) => {
    const seen: unknown[] = []
    const view = (items: Items) => (
      <>
        {list(items)}
        <Probe seen={seen} read={optionLabels} />
      </>
    )
    await render(view([{ value: "a", label: "Before" }]))
    seen.length = 0
    await rerender(
      view([
        { value: "a", label: "After" },
        { value: "b", label: "Next" },
      ])
    )
    await rerender(view([{ value: "b", label: "Next" }]))
    expect(seen).toEqual([["After", "Next"], ["Next"]])
  }
)

const selected = () =>
  options().map(
    (option) =>
      `${option.getAttribute("aria-selected")} ${option.querySelectorAll("[data-slot=listbox-item-indicator]").length}`
  )

test("a controlled multiple listbox marks each new value selected in the render that changes it", async () => {
  const seen: unknown[] = []
  const view = (value: string[]) => (
    <>
      <Listbox aria-label="Choice" multiple value={value}>
        <ListboxItem value="a">
          a<ListboxItemIndicator />
        </ListboxItem>
        <ListboxItem value="b">
          b<ListboxItemIndicator />
        </ListboxItem>
      </Listbox>
      <Probe seen={seen} read={selected} />
    </>
  )
  await render(view(["a"]))
  await rerender(view(["a", "b"]))
  await rerender(view(["b"]))
  expect(seen).toEqual([
    ["true 1", "false 0"],
    ["true 1", "true 1"],
    ["false 0", "true 1"],
  ])
})

// Each matching element's attribute `name`.
const attribute = (selector: string, name: string) => () =>
  [...document.querySelectorAll(selector)].map((el) => el.getAttribute(name))

const groups = {
  MenuRadioGroup: [
    (value: string) => (
      <Menu defaultOpen>
        <MenuTrigger>Align</MenuTrigger>
        <MenuContent>
          <MenuRadioGroup value={value}>
            <MenuRadioItem value="left">
              Left
              <MenuItemIndicator />
            </MenuRadioItem>
            <MenuRadioItem value="right">
              Right
              <MenuItemIndicator />
            </MenuRadioItem>
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
    ),
    () =>
      [...document.querySelectorAll('[role="menuitemradio"]')].map(
        (item) =>
          `${item.getAttribute("aria-checked")} ${item.querySelectorAll("[data-slot=menu-item-indicator]").length}`
      ),
    [
      ["true 1", "false 0"],
      ["false 0", "true 1"],
      ["true 1", "false 0"],
    ],
  ],
  ToggleGroup: [
    (value: string) => (
      <ToggleGroup value={[value]}>
        <Toggle value="left">Left</Toggle>
        <Toggle value="right">Right</Toggle>
      </ToggleGroup>
    ),
    attribute("button", "aria-pressed"),
    [
      ["true", "false"],
      ["false", "true"],
      ["true", "false"],
    ],
  ],
  CheckboxGroup: [
    (value: string) => (
      <CheckboxGroup value={[value]}>
        <Checkbox value="left" />
        <Checkbox value="right" />
      </CheckboxGroup>
    ),
    attribute('[role="checkbox"]', "aria-checked"),
    [
      ["true", "false"],
      ["false", "true"],
      ["true", "false"],
    ],
  ],
} satisfies Record<
  string,
  [(value: string) => React.ReactNode, () => unknown, unknown[]]
>

test.each(Object.entries(groups))(
  "the items of a controlled %s show its new value in the render that changes it",
  async (_name, [group, read, expected]) => {
    const seen: unknown[] = []
    const view = (value: string) => (
      <>
        {group(value)}
        <Probe seen={seen} read={read} />
      </>
    )
    await render(view("left"))
    await rerender(view("right"))
    await rerender(view("left"))
    expect(seen).toEqual(expected)
  }
)

test("toggles show their toolbar's disabled state in the render that changes it", async () => {
  const seen: unknown[] = []
  const view = (disabled: boolean) => (
    <>
      <Toolbar aria-label="Format" disabled={disabled}>
        <Toggle value="bold">Bold</Toggle>
        <ToggleGroup>
          <Toggle value="left">Left</Toggle>
        </ToggleGroup>
      </Toolbar>
      <Probe seen={seen} read={attribute("button", "data-disabled")} />
    </>
  )
  await render(view(false))
  await rerender(view(true))
  await rerender(view(false))
  expect(seen).toEqual([
    [null, null],
    ["", ""],
    [null, null],
  ])
})

const aroundParts = {
  "an accordion trigger its item's": [
    (disabled: boolean) => (
      <Accordion>
        <AccordionItem value="a" disabled={disabled}>
          <AccordionHeader>
            <AccordionTrigger>A</AccordionTrigger>
          </AccordionHeader>
        </AccordionItem>
      </Accordion>
    ),
    attribute("[data-slot=accordion-trigger]", "data-disabled"),
  ],
  "a radio indicator its radio's": [
    (disabled: boolean) => (
      <RadioGroup defaultValue="a">
        <Radio value="a" disabled={disabled}>
          <RadioIndicator />
        </Radio>
      </RadioGroup>
    ),
    attribute("[data-slot=radio-indicator]", "data-disabled"),
  ],
} satisfies Record<
  string,
  [(disabled: boolean) => React.ReactNode, () => unknown]
>

test.each(Object.entries(aroundParts))(
  "a part shows the props of the part around it in the render that changes them, like %s disabled",
  async (_name, [part, read]) => {
    const seen: unknown[] = []
    const view = (disabled: boolean) => (
      <>
        {part(disabled)}
        <Probe seen={seen} read={read} />
      </>
    )
    await render(view(false))
    await rerender(view(true))
    await rerender(view(false))
    expect(seen).toEqual([[null], [""], [null]])
  }
)

const treeLabels = () =>
  [...document.querySelectorAll('[role="treeitem"]')].map(
    (item) => item.textContent
  )

test("a data tree shows its new items in the render that replaces, adds or removes them", async () => {
  const seen: unknown[] = []
  const view = (items: Items) => (
    <>
      <Tree aria-label="Files" items={items} />
      <Probe seen={seen} read={treeLabels} />
    </>
  )
  await render(view([{ value: "file", label: "Before" }]))
  await rerender(view([{ value: "file", label: "After" }]))
  await rerender(
    view([
      { value: "file", label: "After" },
      { value: "notes", label: "Notes" },
    ])
  )
  await rerender(view([{ value: "notes", label: "Notes" }]))
  expect(seen).toEqual([["Before"], ["After"], ["After", "Notes"], ["Notes"]])
})

const grids = () => document.querySelectorAll('[role="grid"]').length

// Records each commit's months with the grids it shows.
function Picker({ months, seen }: { months: number; seen: unknown[] }) {
  return (
    <>
      <DatePicker
        defaultOpen
        months={months}
        today="2026-10-01"
        defaultMonth="2026-10"
      />
      <Probe seen={seen} read={() => [months, grids()]} />
    </>
  )
}

test("a date picker's popup shows as many grids as its months, in the render that changes them", async () => {
  const seen: unknown[] = []
  await render(<Picker months={1} seen={seen} />)
  await rerender(<Picker months={2} seen={seen} />)
  await rerender(<Picker months={1} seen={seen} />)
  expect(seen).toEqual([
    [1, 1],
    [2, 2],
    [1, 1],
  ])
})

let showMonths = (_months: number) => {}

function DeferredPicker({ seen }: { seen: unknown[] }) {
  const [months, setMonths] = React.useState(1)
  showMonths = setMonths
  const deferred = React.useDeferredValue(months)
  return <Picker months={deferred} seen={seen} />
}

test("a date picker shows the months of a deferred render as it commits", async () => {
  const seen: unknown[] = []
  await render(<DeferredPicker seen={seen} />)
  await React.act(async () => showMonths(2))
  expect(seen).toEqual([
    [1, 1],
    [1, 1],
    [2, 2],
  ])
})

const sizes = (view: HTMLElement) =>
  [...view.querySelectorAll("[data-slot=resizable-panel]")].map(
    (panel) => panel.textContent
  )

const panel = (id: string) => (
  <ResizablePanel
    id={id}
    render={(props, state) => <div {...props}>{state.size}</div>}
  />
)

test("a panel that renders its size mounts and shows its share", async () => {
  const view = await render(<Resizable>{panel("only")}</Resizable>)
  expect(sizes(view)).toEqual(["100"])
})

test("panels that render their sizes share the group, and follow its controller", async () => {
  const controller = createResizableController()
  const view = await render(
    <Resizable controller={controller}>
      {panel("start")}
      {panel("end")}
    </Resizable>
  )
  expect(sizes(view)).toEqual(["50", "50"])
  await React.act(async () => controller.setLayout([30, 70]))
  expect(sizes(view)).toEqual(["30", "70"])
})

const pointer = definePrimitive({
  name: "pointer",
  options: { value: "string" },
  state: (options: { value?: string }) => ({
    value: options.value ?? "",
    at: 0,
  }),
  live: ["at"],
  sync: (options) =>
    options.value === undefined ? {} : { value: options.value },
  api: ({ store }) => ({ move: (at: number) => store.set({ at }) }),
  slots: (slot) => ({
    root: slot<{}, { value: string; at: number }>({
      state: ({ value, at }) => ({ value, at }),
    }),
  }),
})

type PointerHandle = PrimitiveHandle<typeof pointer>

// Writes live state while React renders, as a pointer move can land between
// two components of one render when React yields to the browser in a transition.
function Move({ handle, at }: { handle: PointerHandle; at: number }) {
  handle.api.move(at)
  return null
}

function Shown({ handle, seen }: { handle: PointerHandle; seen: string[] }) {
  const element = usePart(
    handle,
    "root",
    {},
    { children: (state) => `${state.value} ${state.at}` },
    "p"
  )
  React.useLayoutEffect(() => {
    seen.push(document.querySelector("p")!.textContent!)
  })
  return element
}

function Pointer({
  value,
  at,
  seen,
}: {
  value: string
  at: number
  seen?: string[]
}) {
  const handle = usePrimitive(pointer, { value })
  return (
    <>
      <Move handle={handle} at={at} />
      {seen && <Shown handle={handle} seen={seen} />}
    </>
  )
}

test("a render shows its controlled value over live state that moved on while it rendered", async () => {
  const seen: string[] = []
  await render(<Pointer value="a" at={0} />)
  await rerender(<Pointer value="b" at={5} seen={seen} />)
  expect(seen[0]).toBe("b 5")
})

test("a handle extended with a context's keys shows what its render shows and follows live state", async () => {
  const seen: string[] = []
  let extended: (PointerHandle & { field: string }) | undefined
  function Extended({ value }: { value: string }) {
    const handle = usePrimitive(pointer, { value })
    extended = React.useMemo(
      () => extendHandle(handle, { field: "name" }),
      [handle]
    )
    seen.push(extended.state.value)
    return null
  }
  await render(<Extended value="a" />)
  await rerender(<Extended value="b" />)
  await React.act(async () => extended!.api.move(5))
  expect(seen).toEqual(["a", "b"])
  expect(extended!.state).toEqual({ value: "b", at: 5 })
})

test("a primitive renders once for a prop change", async () => {
  let renders = 0
  const separator = (orientation: "horizontal" | "vertical") => (
    <Separator
      orientation={orientation}
      render={(props) => {
        renders++
        return <hr {...props} />
      }}
    />
  )
  await render(separator("horizontal"))
  renders = 0
  await rerender(separator("vertical"))
  expect(renders).toBe(1)
})

test("a controlled toggle renders once when its pressed state changes", async () => {
  let renders = 0
  const toggle = (pressed: boolean) => (
    <Toggle
      pressed={pressed}
      render={(props) => {
        renders++
        return <button {...props} />
      }}
    />
  )
  await render(toggle(false))
  renders = 0
  await rerender(toggle(true))
  expect(renders).toBe(1)
})

test("a rating's stars take a new getValueLabel or max in the same render", async () => {
  const seen: unknown[] = []
  const names = () =>
    [...document.querySelectorAll('[role="radio"]')].map(
      (radio) => radio.ariaLabel
    )
  const view = (unit: string, max: number) => (
    <>
      <Rating
        defaultValue={2}
        max={max}
        getValueLabel={(value, of) => `${value} ${unit} of ${of}`}
      />
      <Probe seen={seen} read={names} />
    </>
  )
  await render(view("stars", 5))
  await rerender(view("hearts", 3))
  expect(seen.at(-1)).toEqual([
    "1 hearts of 3",
    "2 hearts of 3",
    "3 hearts of 3",
  ])
})
