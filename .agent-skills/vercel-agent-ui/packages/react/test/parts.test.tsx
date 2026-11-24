// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { Checkbox } from "../src/checkbox"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "../src/collapsible"
import { createRadioGroupController, Radio, RadioGroup } from "../src/radio"
import { Tabs, TabsList, TabsTab } from "../src/tabs"

// How parts keep working through React's double mounts, hidden Suspense
// content, discarded renders and props that change what a part listens for.

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
// jsdom has no Web Animations API, which presence asks when a panel leaves.
Element.prototype.getAnimations ??= () => []

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

const byRole = (container: HTMLElement, role: string, name: string) =>
  [...container.querySelectorAll<HTMLElement>(`[role="${role}"]`)].find(
    (el) => el.getAttribute("aria-label") === name || el.textContent === name
  )!

test("a checkbox under StrictMode checks on a click", async () => {
  const view = await render(
    <React.StrictMode>
      <Checkbox aria-label="Terms" />
    </React.StrictMode>
  )
  const checkbox = byRole(view, "checkbox", "Terms")
  await React.act(async () => checkbox.click())
  expect(checkbox.getAttribute("aria-checked")).toBe("true")
  expect(checkbox.getAttribute("data-checked")).toBe("")
})

const never = new Promise<void>(() => {})

function Suspends({ until }: { until: Promise<void> | undefined }) {
  if (until) {
    React.use(until)
  }
  return null
}

function HiddenCollapsible({ until }: { until?: Promise<void> }) {
  return (
    <React.Suspense fallback={<p>Loading</p>}>
      <Collapsible>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsiblePanel>Shipping in two days.</CollapsiblePanel>
        <Suspends until={until} />
      </Collapsible>
    </React.Suspense>
  )
}

test("a collapsible that Suspense hid and showed again opens and points at its panel", async () => {
  const view = await render(<HiddenCollapsible />)
  let resolve = () => {}
  const until = new Promise<void>((done) => (resolve = done))
  await React.act(async () => root!.render(<HiddenCollapsible until={until} />))
  expect(view.querySelector("p")?.textContent).toBe("Loading")
  await React.act(async () => resolve())
  const trigger = view.querySelector("button")!
  await React.act(async () => trigger.click())
  const panel = view.querySelector<HTMLElement>(
    '[data-slot="collapsible-panel"]'
  )!
  expect(trigger.getAttribute("aria-expanded")).toBe("true")
  expect(panel.textContent).toBe("Shipping in two days.")
  expect(trigger.getAttribute("aria-controls")).toBe(panel.id)
})

let disableFirst = () => {}

function TransitionTabs() {
  const [disabled, setDisabled] = React.useState(false)
  disableFirst = () => React.startTransition(() => setDisabled(true))
  return (
    <React.Suspense fallback={null}>
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTab value="a" disabled={disabled}>
            Account
          </TabsTab>
          <TabsTab value="b">Billing</TabsTab>
        </TabsList>
        <Suspends until={disabled ? never : undefined} />
      </Tabs>
    </React.Suspense>
  )
}

test("a part keeps its committed props when a transition with new ones suspends", async () => {
  const view = await render(<TransitionTabs />)
  await React.act(async () => disableFirst())
  await React.act(async () => byRole(view, "tab", "Billing").click())
  const account = byRole(view, "tab", "Account")
  expect(account.getAttribute("aria-selected")).toBe("false")
  expect(account.getAttribute("aria-disabled")).toBe(null)
  expect(byRole(view, "tab", "Billing").getAttribute("aria-selected")).toBe(
    "true"
  )
})

const controller = createRadioGroupController()

function Plans({ value }: { value: string }) {
  return (
    <RadioGroup controller={controller} defaultValue="free">
      <Radio value="free" aria-label="Free" />
      <Radio value={value} aria-label="Paid" />
    </RadioGroup>
  )
}

test("a radio whose value changed checks when the group selects the new value", async () => {
  const view = await render(<Plans value="monthly" />)
  await React.act(async () => root!.render(<Plans value="yearly" />))
  await React.act(async () => controller.setValue("yearly"))
  expect(byRole(view, "radio", "Paid").getAttribute("aria-checked")).toBe(
    "true"
  )
  expect(byRole(view, "radio", "Free").getAttribute("aria-checked")).toBe(
    "false"
  )
})
