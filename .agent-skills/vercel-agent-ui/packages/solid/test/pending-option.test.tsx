// A controlled option that is still loading suspends the root, not the
// component that renders it, so that component and its source are made once.
import { render } from "@solidjs/web"
import { createMemo, flush, Loading, type JSX } from "solid-js"
import { afterEach, expect, test } from "vitest"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "../src/collapsible"
import { Switch } from "../src/switch"

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

const settled = () => new Promise((resolve) => setTimeout(resolve))

const roots: Record<
  string,
  { view: (value: () => boolean) => JSX.Element; attribute: string }
> = {
  collapsible: {
    view: (open) => (
      <Collapsible open={open()}>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsiblePanel>Panel</CollapsiblePanel>
      </Collapsible>
    ),
    attribute: "aria-expanded",
  },
  switch: {
    view: (checked) => (
      <Switch checked={checked()} aria-label="Notifications" />
    ),
    attribute: "aria-checked",
  },
}

for (const [name, { view, attribute }] of Object.entries(roots)) {
  test(`a ${name} waits for a controlled option that is loading, and its parent is made once`, async () => {
    let arrive = (_: boolean) => {}
    let made = 0
    function Parent() {
      made++
      const value = createMemo(
        () =>
          new Promise<boolean>((resolve) => {
            arrive = resolve
          })
      )
      return view(value)
    }
    const root = document.body.appendChild(document.createElement("div"))
    dispose = render(
      () => (
        <Loading fallback="Waiting">
          <Parent />
        </Loading>
      ),
      root
    )
    flush()
    expect(root.textContent).toBe("Waiting")

    arrive(true)
    await settled()
    flush()
    expect(made).toBe(1)
    expect(root.querySelector("button")?.getAttribute(attribute)).toBe("true")
  })
}
