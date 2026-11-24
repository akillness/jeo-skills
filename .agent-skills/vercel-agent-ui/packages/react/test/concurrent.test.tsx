// @vitest-environment jsdom
import { definePrimitive } from "@ui-sdk/core"
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test, vi } from "vitest"
import { fakeEditor } from "../../core/test/fake-editor"
import { createAgent } from "../src/agent"
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "../src/menu"
import {
  NumberInput,
  NumberInputControl,
  NumberInputGroup,
  NumberInputScrubArea,
} from "../src/number-input"
import { usePart, usePrimitive, type PrimitiveHandle } from "../src/primitive"
import {
  createTabsController,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
} from "../src/tabs"
import { Tree, TreeGroup, TreeItem, TreeItemLabel } from "../src/tree"
import { TriggerMenu } from "../src/trigger-menu"

// Parts under React's concurrent features: transitions that suspend, renders
// React throws away, Suspense hiding a tree and <Activity> hiding it longer.
// They should behave like plain React state.

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
// jsdom has no Web Animations API, which presence asks when a panel leaves.
Element.prototype.getAnimations ??= () => []

// Before anything renders, so it hears every instance.
const agent = createAgent()

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

const tab = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (el) => el.textContent === name
  )!

function Suspends({ until }: { until?: Promise<void> }) {
  if (until) {
    React.use(until)
  }
  return null
}

let select = (_value: string) => {}

function SlowBilling({ until }: { until: Promise<void> }) {
  const [value, setValue] = React.useState("account")
  select = (next) => React.startTransition(() => setValue(next))
  return (
    <Tabs value={value} onValueChange={(next) => setValue(next as string)}>
      <TabsList>
        <TabsTab value="account">Account</TabsTab>
        <TabsTab value="billing">Billing</TabsTab>
      </TabsList>
      <React.Suspense fallback={<p>Loading</p>}>
        <TabsPanel value="account">Account settings</TabsPanel>
        <TabsPanel value="billing">
          <Suspends until={until} />
          Billing settings
        </TabsPanel>
      </React.Suspense>
    </Tabs>
  )
}

test("a transition to a tab whose panel suspends keeps showing the old tab, like plain state", async () => {
  let resolve = () => {}
  const until = new Promise<void>((done) => (resolve = done))
  const view = await render(<SlowBilling until={until} />)
  await React.act(async () => select("billing"))
  expect(view.textContent).not.toContain("Loading")
  expect(view.textContent).toContain("Account settings")
  expect(tab(view, "Account").getAttribute("aria-selected")).toBe("true")
  await React.act(async () => resolve())
  expect(view.textContent).toContain("Billing settings")
  expect(tab(view, "Billing").getAttribute("aria-selected")).toBe("true")
})

let disable = () => {}
const never = new Promise<void>(() => {})

function DisabledInTransition() {
  const [disabled, setDisabled] = React.useState(false)
  disable = () => React.startTransition(() => setDisabled(true))
  return (
    <React.Suspense fallback={null}>
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTab value="account">Account</TabsTab>
          <TabsTab value="billing" disabled={disabled}>
            Billing
          </TabsTab>
        </TabsList>
        <Suspends until={disabled ? never : undefined} />
      </Tabs>
    </React.Suspense>
  )
}

test("a tab acts on what's on the page, not on a transition that never committed", async () => {
  const view = await render(<DisabledInTransition />)
  await React.act(async () => disable())
  // The page still shows Billing enabled, so a click selects it.
  expect(tab(view, "Billing").getAttribute("aria-disabled")).toBe(null)
  await React.act(async () => tab(view, "Billing").click())
  expect(tab(view, "Billing").getAttribute("aria-selected")).toBe("true")
})

function HiddenTabs({ until }: { until?: Promise<void> }) {
  return (
    <React.Suspense fallback={<p>Loading</p>}>
      <Tabs defaultValue="account" aria-label="Settings">
        <TabsList>
          <TabsTab value="account">Account</TabsTab>
          <TabsTab value="billing">Billing</TabsTab>
        </TabsList>
      </Tabs>
      <Suspends until={until} />
    </React.Suspense>
  )
}

test("tabs Suspense hid and showed again keep their instance, and the agent still reaches them", async () => {
  const view = await render(<HiddenTabs />)
  await React.act(async () => tab(view, "Billing").click())
  let resolve = () => {}
  const until = new Promise<void>((done) => (resolve = done))
  await React.act(async () => root!.render(<HiddenTabs until={until} />))
  expect(view.textContent).toContain("Loading")
  await new Promise((done) => setTimeout(done, 20))
  await React.act(async () => resolve())
  expect(agent.snapshot()).toContainEqual(
    expect.objectContaining({
      component: "tabs",
      value: "billing",
      actions: ["setValue"],
    })
  )
  const [{ ref }] = agent
    .snapshot()
    .filter((component) => component.component === "tabs" && !component.offPage)
  await agent.act({ steps: [{ ref, action: "setValue", args: ["account"] }] })
  expect(tab(view, "Account").getAttribute("aria-selected")).toBe("true")
})

function ActivityTabs({ mode }: { mode: "visible" | "hidden" }) {
  return (
    <React.Activity mode={mode}>
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTab value="account">Account</TabsTab>
          <TabsTab value="billing">Billing</TabsTab>
        </TabsList>
      </Tabs>
    </React.Activity>
  )
}

test("tabs <Activity> hid and showed again start where they were, and keep working", async () => {
  const view = await render(<ActivityTabs mode="visible" />)
  await React.act(async () => tab(view, "Billing").click())
  await React.act(async () => root!.render(<ActivityTabs mode="hidden" />))
  await new Promise((done) => setTimeout(done, 20))
  await React.act(async () => root!.render(<ActivityTabs mode="visible" />))
  expect(tab(view, "Billing").getAttribute("aria-selected")).toBe("true")
  const live = agent
    .snapshot()
    .filter((component) => component.component === "tabs" && !component.offPage)
  expect(live).toEqual([
    expect.objectContaining({ value: "billing", actions: ["setValue"] }),
  ])
  await React.act(async () => tab(view, "Account").click())
  expect(tab(view, "Account").getAttribute("aria-selected")).toBe("true")
})

const controller = createTabsController()
let replace = () => {}

function ControlledByKey() {
  const [version, setVersion] = React.useState(1)
  replace = () => React.startTransition(() => setVersion(2))
  return (
    <React.Suspense fallback={null}>
      <Tabs key={version} controller={controller} defaultValue="account">
        <TabsList>
          <TabsTab value="account">Account</TabsTab>
          <TabsTab value="billing">Billing</TabsTab>
        </TabsList>
        <Suspends until={version === 2 ? never : undefined} />
      </Tabs>
    </React.Suspense>
  )
}

test("a controller stays with the tabs on the page while their replacement suspends", async () => {
  const view = await render(<ControlledByKey />)
  await React.act(async () => replace())
  await React.act(async () => controller.setValue("billing"))
  expect(tab(view, "Billing").getAttribute("aria-selected")).toBe("true")
})

let setQuantity = (_value: number) => {}

function Quantity() {
  const [value, setValue] = React.useState<number | null>(1)
  setQuantity = setValue
  return (
    <NumberInput value={value} onValueChange={setValue}>
      <NumberInputScrubArea>Quantity</NumberInputScrubArea>
      <NumberInputGroup>
        <NumberInputControl aria-label="Quantity" />
      </NumberInputGroup>
    </NumberInput>
  )
}

test("parts that read a root's handle through their own context render a controlled change", async () => {
  const view = await render(<Quantity />)
  await React.act(async () => setQuantity(2))
  expect(view.querySelector("input")!.value).toBe("2")
})

function Align() {
  const [align, setAlign] = React.useState("left")
  return (
    <Menu defaultOpen>
      <MenuTrigger>Edit</MenuTrigger>
      <MenuContent>
        <MenuRadioGroup value={align} onValueChange={setAlign}>
          <MenuRadioItem value="left" closeOnSelect={false}>
            Left
          </MenuRadioItem>
          <MenuRadioItem value="right" closeOnSelect={false}>
            Right
          </MenuRadioItem>
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}

test("parts that read another part's props follow it when it commits, like radio items their group", async () => {
  await render(<Align />)
  const item = (name: string) =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
      (el) => el.textContent === name
    )!
  await React.act(async () => item("Right").click())
  expect(item("Right").getAttribute("aria-checked")).toBe("true")
  expect(item("Left").getAttribute("aria-checked")).toBe("false")
})

test("a TriggerMenu from a render React threw away never follows the editor", async () => {
  const editor = fakeEditor()
  const onOpenChange = vi.fn()
  let show = (_on: boolean) => {}
  function Mention() {
    const [on, setOn] = React.useState(false)
    show = setOn
    if (!on) {
      return null
    }
    return (
      <>
        <TriggerMenu
          editor={editor}
          triggers={[{ char: "@", items: [{ value: "ada", label: "Ada" }] }]}
          onOpenChange={onOpenChange}
        />
        <Suspends until={never} />
      </>
    )
  }
  await render(
    <React.Suspense fallback={null}>
      <Mention />
    </React.Suspense>
  )
  await React.act(async () => React.startTransition(() => show(true)))
  await React.act(async () => show(false))
  await React.act(async () => editor.type("hi @"))
  expect(onOpenChange).not.toHaveBeenCalled()
})

const list = definePrimitive({
  name: "list",
  state: (_options: {}) => ({}),
  api: ({ parts }) => ({
    items: () =>
      [...parts()]
        .filter((part) => part.slot === "item")
        .map((part) => part.key),
  }),
  slots: (slot) => ({
    root: slot({}),
    item: slot<{ value: string }>({ props: { value: "string" } }),
  }),
})

let search = (_query: string) => {}

function Results() {
  const [query, setQuery] = React.useState("a")
  search = setQuery
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Result key={`${query}${i}`} value={`${query}${i}`} />
      ))}
      {query === "slow" ? <Suspends until={never} /> : null}
    </>
  )
}

function Result({ value }: { value: string }) {
  return usePart(list, "item", { value }, {}, "li")
}

let results: PrimitiveHandle<typeof list>

function List() {
  results = usePrimitive(list, {})
  const children = (
    <React.Suspense fallback={null}>
      <Results />
    </React.Suspense>
  )
  return usePart(results, "root", {}, { children }, "ul")
}

test("parts from a render React threw away don't stay with the instance", async () => {
  await render(<List />)
  await React.act(async () => React.startTransition(() => search("slow")))
  await React.act(async () => search("b"))
  expect(results.api.items()).toEqual(["b0", "b1", "b2"])
})

test("usePart keeps committed props in event handlers while a transition suspends", async () => {
  const pressed = vi.fn()
  const clicker = definePrimitive({
    name: "clicker",
    state: (_options: {}) => ({}),
    api: () => ({ press: pressed }),
    slots: (slot) => ({
      root: slot<{ disabled: boolean }>({
        props: { disabled: "boolean" },
        attrs: (_state, { props }) => ({
          disabled: props.disabled ? "" : undefined,
        }),
        on: {
          click: (_event, { props, api }) => {
            if (!props.disabled) {
              api.press()
            }
          },
        },
      }),
    }),
  })
  let disable = () => {}
  function Clicker() {
    const [disabled, setDisabled] = React.useState(false)
    disable = () => React.startTransition(() => setDisabled(true))
    const handle = usePrimitive(clicker, {})
    const button = usePart(
      handle,
      "root",
      { disabled },
      { children: "Press" },
      "button"
    )
    return (
      <>
        {button}
        {disabled && <Suspends until={never} />}
      </>
    )
  }
  const view = await render(
    <React.Suspense fallback={<p>Loading</p>}>
      <Clicker />
    </React.Suspense>
  )
  await React.act(async () => disable())
  const button = view.querySelector("button")!
  expect(button.disabled).toBe(false)
  await React.act(async () => button.click())
  expect(pressed).toHaveBeenCalledTimes(1)
})

let addFile = (_name: string) => {}

function NewFile() {
  const [name, setName] = React.useState<string>()
  addFile = setName
  if (!name) {
    return null
  }
  return (
    <TreeItem value={name}>
      <TreeItemLabel>{name}</TreeItemLabel>
      {name === "draft" ? <Suspends until={never} /> : null}
    </TreeItem>
  )
}

test("a tree item from a render React threw away isn't checked with its folder", async () => {
  const onCheckedChange = vi.fn()
  const view = await render(
    <Tree
      aria-label="Files"
      checkable
      mode="none"
      defaultExpanded={["src"]}
      onCheckedChange={onCheckedChange}
    >
      <TreeItem value="src">
        <TreeItemLabel>src</TreeItemLabel>
        <TreeGroup>
          <TreeItem value="index">
            <TreeItemLabel>index</TreeItemLabel>
          </TreeItem>
          <React.Suspense fallback={null}>
            <NewFile />
          </React.Suspense>
        </TreeGroup>
      </TreeItem>
    </Tree>
  )
  await React.act(async () => React.startTransition(() => addFile("draft")))
  await React.act(async () => addFile("readme"))
  const folder = view.querySelector<HTMLElement>('[role="treeitem"]')!
  await React.act(async () => {
    folder.focus()
    folder.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      })
    )
  })
  expect(onCheckedChange.mock.lastCall?.[0]).toEqual(["index", "readme"])
})

let renameTab = (_id: string) => {}
let rerenderPanel = () => {}

function PanelWithCount() {
  const [count, setCount] = React.useState(0)
  rerenderPanel = () => setCount((value) => value + 1)
  return <TabsPanel value="account">Account {count}</TabsPanel>
}

function RenamedInTransition() {
  const [id, setId] = React.useState("first")
  renameTab = (next) => React.startTransition(() => setId(next))
  return (
    <Tabs defaultValue="account">
      <TabsList aria-label="Settings">
        <TabsTab value="account" id={id}>
          Account
        </TabsTab>
      </TabsList>
      <PanelWithCount />
      <React.Suspense fallback={null}>
        <Suspends until={id === "first" ? undefined : never} />
      </React.Suspense>
    </Tabs>
  )
}

test("a panel stays labelled by its tab's id on the page, not one from a transition that never committed", async () => {
  const view = await render(<RenamedInTransition />)
  await React.act(async () => renameTab("second"))
  await React.act(async () => rerenderPanel())
  const panel = view.querySelector<HTMLElement>('[role="tabpanel"]')!
  expect(panel.textContent).toBe("Account 1")
  expect(tab(view, "Account").id).toBe("first")
  expect(panel.getAttribute("aria-labelledby")).toBe("first")
})
