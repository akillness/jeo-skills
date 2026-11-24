import { attribution } from "solid-js/attribution"
import { render } from "@solidjs/web"
import { createSignal, flush, OBSERVE } from "solid-js"
import { afterEach, expect, test, vi } from "vitest"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "../src/collapsible"
import { Command, CommandInput, CommandItem, CommandList } from "../src/command"
import { Switch } from "../src/switch"
import { Tabs, TabsList, TabsPanel, TabsTab } from "../src/tabs"

// Solid's dev diagnostics, on while controlled components change from the
// app's signals and from presses. A code here means the adapter goes against
// Solid's own guidance. The checks that measure time are off, since how long
// a run takes depends on the machine, not the code.

let release = () => {}

afterEach(() => {
  release()
  document.body.replaceChildren()
})

function watchDiagnostics() {
  vi.spyOn(console, "warn").mockImplementation(() => {})
  const codes = new Set<string>()
  const off = OBSERVE!.diagnostics.subscribe((event) => codes.add(event.code))
  release = attribution.enable({
    log: false,
    hotTime: false,
    wastedRecompute: false,
  })
  return { codes, off }
}

test("controlled components raise none of Solid's diagnostics", () => {
  const { codes, off } = watchDiagnostics()
  const [open, setOpen] = createSignal(false)
  const [tab, setTab] = createSignal("account")
  const [on, setOn] = createSignal(false)
  const root = document.body.appendChild(document.createElement("div"))
  const dispose = render(
    () => (
      <>
        <Collapsible open={open()} onOpenChange={setOpen}>
          <CollapsibleTrigger>Details</CollapsibleTrigger>
          <CollapsiblePanel>Panel</CollapsiblePanel>
        </Collapsible>
        <Tabs value={tab()} onValueChange={(value) => setTab(value as string)}>
          <TabsList>
            <TabsTab value="account">Account</TabsTab>
            <TabsTab value="billing">Billing</TabsTab>
          </TabsList>
          <TabsPanel value="account">Account settings</TabsPanel>
          <TabsPanel value="billing">Billing settings</TabsPanel>
        </Tabs>
        <Switch checked={on()} onCheckedChange={setOn} />
      </>
    ),
    root
  )
  flush()
  for (let i = 0; i < 6; i++) {
    setOpen((open) => !open)
    setTab((tab) => (tab === "account" ? "billing" : "account"))
    setOn((on) => !on)
    flush()
  }
  for (let i = 0; i < 4; i++) {
    root
      .querySelector<HTMLElement>('[data-slot="collapsible-trigger"]')!
      .click()
    root.querySelectorAll<HTMLElement>('[role="tab"]')[i % 2].click()
    root.querySelector<HTMLElement>('[role="switch"]')!.click()
    flush()
  }
  off()
  dispose()
  expect([...codes]).toEqual([])
})

test("a Command with its text and value controlled raises none while typing", async () => {
  const { codes, off } = watchDiagnostics()
  const [query, setQuery] = createSignal("")
  const [value, setValue] = createSignal<string | null>(null)
  const root = document.body.appendChild(document.createElement("div"))
  const dispose = render(
    () => (
      <Command
        query={query()}
        onQueryChange={setQuery}
        value={value()}
        onValueChange={setValue}
      >
        <CommandInput aria-label="Search" />
        <CommandList>
          <CommandItem value="calendar" label="Calendar" />
          <CommandItem value="billing" label="Billing" />
        </CommandList>
      </Command>
    ),
    root
  )
  flush()
  await new Promise((resolve) => setTimeout(resolve))
  const input = root.querySelector("input")!
  for (const text of ["c", "b", ""]) {
    input.value = text
    input.dispatchEvent(new InputEvent("input", { bubbles: true }))
    flush()
  }
  off()
  dispose()
  expect(value()).toBe("calendar")
  expect([...codes]).toEqual([])
})
