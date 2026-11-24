// @vitest-environment jsdom
// A `render` element from a Server Component can reach a client part as a
// lazy wrapper, which React's Flight client makes while the element's module loads.
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { Button } from "../src/button"
import { Field, FieldControl, FieldDescription } from "../src/field"
import { Tabs, TabsList, TabsPanel, TabsTab } from "../src/tabs"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

function lazyElement(element: React.ReactElement, loading?: Promise<void>) {
  const payload = { loading }
  loading?.then(() => (payload.loading = undefined))
  return {
    $$typeof: Symbol.for("react.lazy"),
    _payload: payload,
    _init: ({ loading }: typeof payload) => {
      if (loading) {
        throw loading
      }
      return element
    },
  } as unknown as React.ReactElement
}

async function mount(node: React.ReactNode) {
  const host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await React.act(async () => root!.render(node))
  return host
}

test("a part renders a lazy render element once it has loaded", async () => {
  let loaded = () => {}
  const loading = new Promise<void>((resolve) => (loaded = resolve))
  const host = await mount(
    <React.Suspense fallback="Loading">
      <Button render={lazyElement(<a href="/docs" />, loading)}>Docs</Button>
    </React.Suspense>
  )
  expect(host.textContent).toBe("Loading")
  await React.act(async () => loaded())
  const link = host.querySelector("a")!
  expect(link.getAttribute("href")).toBe("/docs")
  expect(link.getAttribute("data-slot")).toBe("button")
  expect(link.textContent).toBe("Docs")
})

test("a part renders a render element inside two lazy wrappers", async () => {
  let loaded = () => {}
  const loading = new Promise<void>((resolve) => (loaded = resolve))
  const host = await mount(
    <React.Suspense fallback="Loading">
      <Tabs defaultValue="docs">
        <TabsList aria-label="Pages">
          <TabsTab
            value="docs"
            render={lazyElement(lazyElement(<a href="/docs" />, loading))}
          >
            Docs
          </TabsTab>
        </TabsList>
      </Tabs>
    </React.Suspense>
  )
  expect(host.textContent).toBe("Loading")
  await React.act(async () => loaded())
  const link = host.querySelector("a")!
  expect(link.getAttribute("href")).toBe("/docs")
  expect(link.getAttribute("role")).toBe("tab")
})

test("an id on a lazy render element is the part's id", async () => {
  const host = await mount(
    <Tabs defaultValue="account">
      <TabsList aria-label="Settings">
        <TabsTab
          value="account"
          render={lazyElement(<button id="account-tab" />)}
        >
          Account
        </TabsTab>
      </TabsList>
      <TabsPanel value="account">Account</TabsPanel>
    </Tabs>
  )
  expect(
    host.querySelector('[role="tabpanel"]')!.getAttribute("aria-labelledby")
  ).toBe("account-tab")
})

test("a part that isn't in the page doesn't wait for its lazy render element", async () => {
  const host = await mount(
    <React.Suspense fallback="Loading">
      <Tabs defaultValue="account">
        <TabsList aria-label="Settings">
          <TabsTab value="account">Account</TabsTab>
          <TabsTab value="billing">Billing</TabsTab>
        </TabsList>
        <TabsPanel value="account">Account settings</TabsPanel>
        <TabsPanel
          value="billing"
          render={lazyElement(<section />, new Promise(() => {}))}
        >
          Billing settings
        </TabsPanel>
      </Tabs>
    </React.Suspense>
  )
  expect(host.querySelector('[role="tabpanel"]')!.textContent).toBe(
    "Account settings"
  )
})

test("a description on a lazy render element stays ahead of the field's", async () => {
  const host = await mount(
    <Field>
      <FieldControl render={lazyElement(<input aria-describedby="hint" />)} />
      <FieldDescription>Shown on your profile.</FieldDescription>
    </Field>
  )
  expect(host.querySelector("input")!.getAttribute("aria-describedby")).toBe(
    `hint ${host.querySelector('[data-slot="field-description"]')!.id}`
  )
})
