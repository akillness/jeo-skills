import { createPopoverController } from "@ui-sdk/core/popover"
import { render } from "@solidjs/web"
import { flush } from "solid-js"
import { describe, expect, test } from "vitest"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "../src/collapsible"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "../src/popover"

function mount(code: () => any) {
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(code, root)
  flush()
  return { root, dispose }
}

// Settles the microtasks a change queues, like binding and core's own deferrals.
const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve()
  }
  flush()
}

describe("event handlers", () => {
  test("a user's handler runs before the part's, and preventDefault() skips the part's", async () => {
    const calls: string[] = []
    const { root, dispose } = mount(() => (
      <Collapsible onOpenChange={(open) => calls.push(`open:${open}`)}>
        <CollapsibleTrigger onClick={() => calls.push("user")}>
          Details
        </CollapsibleTrigger>
        <CollapsiblePanel>Panel</CollapsiblePanel>
      </Collapsible>
    ))
    const trigger = root.querySelector("button")!
    trigger.click()
    await settle()
    expect(calls).toEqual(["user", "open:true"])
    dispose()
  })

  test("preventDefault() in the user's handler skips the part's", async () => {
    const calls: string[] = []
    const { root, dispose } = mount(() => (
      <Collapsible onOpenChange={(open) => calls.push(`open:${open}`)}>
        <CollapsibleTrigger
          onClick={(event) => {
            calls.push("user")
            event.preventDefault()
          }}
        >
          Details
        </CollapsibleTrigger>
        <CollapsiblePanel>Panel</CollapsiblePanel>
      </Collapsible>
    ))
    root.querySelector("button")!.click()
    await settle()
    expect(calls).toEqual(["user"])
    expect(root.querySelector("button")!.getAttribute("aria-expanded")).toBe(
      "false"
    )
    dispose()
  })

  test("Escape in a nested popup closes only the innermost", async () => {
    const outer = createPopoverController()
    const inner = createPopoverController()
    const { root, dispose } = mount(() => (
      <Popover controller={outer}>
        <PopoverTrigger>Outer</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Outer title</PopoverTitle>
          <Popover controller={inner}>
            <PopoverTrigger>Inner</PopoverTrigger>
            <PopoverContent>
              <PopoverTitle>Inner title</PopoverTitle>
              <input aria-label="Name" />
            </PopoverContent>
          </Popover>
        </PopoverContent>
      </Popover>
    ))
    outer.open()
    await settle()
    inner.open()
    await settle()
    const dialogs = () =>
      [...document.querySelectorAll('[role="dialog"]')].map(
        (el) => el.querySelector("h2")!.textContent
      )
    expect(dialogs()).toEqual(["Outer title", "Inner title"])
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Name"]'
    )!
    input.focus()
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      })
    )
    await settle()
    expect(dialogs()).toEqual(["Outer title"])
    expect(outer.isOpen()).toBe(true)
    expect(inner.isOpen()).toBe(false)
    dispose()
    expect(root.textContent).toBe("")
  })
})
