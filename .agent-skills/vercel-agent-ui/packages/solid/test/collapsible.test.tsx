import { createEffect, createSignal, flush, Show } from "solid-js"
import { render } from "@solidjs/web"
import { describe, expect, test } from "vitest"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "../src/collapsible"

function mount(code: () => any) {
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(code, root)
  flush()
  return { root, dispose }
}

describe("collapsible", () => {
  test("opens on press and renders its panel", async () => {
    const log: string[] = []
    const { root, dispose } = mount(() => (
      <Collapsible
        class="c"
        onOpenChange={(open, details) => log.push(`${open}:${details.reason}`)}
      >
        <CollapsibleTrigger
          class={(state) => (state.open ? "is-open" : "is-closed")}
          onClick={() => log.push("user click")}
        >
          Details
        </CollapsibleTrigger>
        <CollapsiblePanel class="panel">
          {(state) => <p>{state.open ? "open" : "closed"}</p>}
        </CollapsiblePanel>
      </Collapsible>
    ))
    const trigger = root.querySelector("button")!
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(trigger.className).toBe("is-closed")
    expect(root.querySelector(".panel")).toBeNull()
    trigger.click()
    for (let i = 0; i < 3; i++) {
      await Promise.resolve()
    }
    flush()
    expect(log).toEqual(["user click", "true:trigger-press"])
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(trigger.className).toBe("is-open")
    expect(root.querySelector(".panel")?.textContent).toBe("open")
    expect(trigger.getAttribute("aria-controls")).toBe(
      root.querySelector(".panel")!.id
    )
    dispose()
  })

  // Solid runs an effect once the DOM shows the signals it read, so an app
  // effect on its own `open`, like one focusing what opened, finds the panel.
  test("an app effect on a controlled `open` sees the panel it opened", () => {
    const [open, setOpen] = createSignal(false)
    const seen: string[] = []
    function Watch() {
      createEffect(open, () => {
        seen.push(
          `${!!document.querySelector(".panel")} ${!!document.querySelector(".own")}`
        )
      })
      return null
    }
    const { dispose } = mount(() => (
      <>
        <Collapsible open={open()}>
          <CollapsibleTrigger>Details</CollapsibleTrigger>
          <CollapsiblePanel class="panel">Details</CollapsiblePanel>
        </Collapsible>
        <Show when={open()}>
          <p class="own">Own</p>
        </Show>
        <Watch />
      </>
    ))
    setOpen(true)
    flush()
    expect(seen).toEqual(["false false", "true true"])
    dispose()
  })
})
