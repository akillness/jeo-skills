// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test, vi } from "vitest"
import { Tabs, TabsList, TabsPanel, TabsTab } from "../src/tabs"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.getAnimations ??= () => []

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

function lateTab(value: string) {
  let loaded = () => {}
  const loading = new Promise<{ default: React.ComponentType }>(
    (resolve) =>
      (loaded = () =>
        resolve({ default: () => <TabsTab value={value}>{value}</TabsTab> }))
  )
  return { Late: React.lazy(() => loading), loaded }
}

async function mount(node: React.ReactNode) {
  const host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await React.act(async () => root!.render(node))
  return host
}

const selected = (host: HTMLElement) =>
  [...host.querySelectorAll('[role="tab"][aria-selected="true"]')].map(
    (tab) => tab.textContent
  )

test("the default tab is selected once it binds after the others", async () => {
  const { Late, loaded } = lateTab("billing")
  const onValueChange = vi.fn()
  const host = await mount(
    <Tabs defaultValue="billing" onValueChange={onValueChange}>
      <TabsList aria-label="Settings">
        <TabsTab value="general">general</TabsTab>
        <React.Suspense fallback={null}>
          <Late />
        </React.Suspense>
      </TabsList>
      <TabsPanel value="general">General panel</TabsPanel>
      <TabsPanel value="billing">Billing panel</TabsPanel>
    </Tabs>
  )
  expect(selected(host)).toEqual(["general"])
  await React.act(async () => loaded())
  expect(selected(host)).toEqual(["billing"])
  expect(
    host.querySelector('[role="tabpanel"]:not([hidden])')?.textContent
  ).toBe("Billing panel")
  expect(onValueChange).not.toHaveBeenCalled()
})

test("a tab picked before the default's tab binds stays selected", async () => {
  const { Late, loaded } = lateTab("billing")
  const host = await mount(
    <Tabs defaultValue="billing">
      <TabsList aria-label="Settings">
        <TabsTab value="general">general</TabsTab>
        <TabsTab value="team">team</TabsTab>
        <React.Suspense fallback={null}>
          <Late />
        </React.Suspense>
      </TabsList>
    </Tabs>
  )
  await React.act(async () =>
    host.querySelectorAll<HTMLElement>('[role="tab"]')[1]!.click()
  )
  await React.act(async () => loaded())
  expect(selected(host)).toEqual(["team"])
})

test("a tab picked and left before the default's tab binds keeps the pick", async () => {
  const { Late, loaded } = lateTab("billing")
  const host = await mount(
    <Tabs defaultValue="billing">
      <TabsList aria-label="Settings">
        <TabsTab value="general">general</TabsTab>
        <TabsTab value="team">team</TabsTab>
        <React.Suspense fallback={null}>
          <Late />
        </React.Suspense>
      </TabsList>
    </Tabs>
  )
  const tabs = host.querySelectorAll<HTMLElement>('[role="tab"]')
  await React.act(async () => tabs[1]!.click())
  await React.act(async () => tabs[0]!.click())
  await React.act(async () => loaded())
  expect(selected(host)).toEqual(["general"])
})
