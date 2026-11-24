import { render } from "@solidjs/web"
import { createSignal, Errored, flush, OBSERVE, Show } from "solid-js"
import { attribution } from "solid-js/attribution"
import { afterEach, expect, test, vi } from "vitest"
import {
  createSelectController,
  Select,
  SelectTrigger,
  SelectValue,
} from "../src/select"

let dispose = () => {}
let stop = () => {}
let release = () => {}
afterEach(() => {
  dispose()
  stop()
  release()
  document.body.replaceChildren()
})

test.each([false, true])(
  "an external value follows its controller after rendering callbacks with placeholder state, custom children: %s",
  async (customChildren) => {
    const codes = new Set<string>()
    stop = OBSERVE!.diagnostics.subscribe((event) => codes.add(event.code))
    release = attribution.enable({
      log: false,
      hotTime: false,
      wastedRecompute: false,
    })
    const controller = createSelectController<string>()
    const [connected, setConnected] = createSignal(false)
    const root = document.body.appendChild(document.createElement("div"))
    dispose = render(
      () => (
        <Errored
          fallback={(error) => <output data-error>{String(error())}</output>}
        >
          <SelectTrigger controller={controller}>
            <SelectValue
              placeholder="Pick"
              class={(state) => `value-${state.label.toLowerCase()}`}
              style={(state) => ({ "--labels": state.labels.length })}
              render={(props, state) => (
                <span
                  {...props}
                  data-labels={state.labels.length}
                  data-value={state.value === null ? "empty" : "selected"}
                  data-placeholder={String(state.placeholder)}
                />
              )}
            >
              {customChildren
                ? (state) => `Choices: ${state.labels.join(", ") || "none"}`
                : undefined}
            </SelectValue>
          </SelectTrigger>
          <Show when={connected()}>
            <Select
              controller={controller}
              items={["Apple", "Pear"]}
              defaultValue="Apple"
            />
          </Show>
        </Errored>
      ),
      root
    )
    flush()

    expect(root.querySelector("[data-error]")).toBeNull()
    const value = () => root.querySelector<HTMLSpanElement>("button span")!
    expect(value().textContent).toBe(customChildren ? "Choices: none" : "Pick")
    expect(value().className).toBe("value-")
    expect(value().style.getPropertyValue("--labels")).toBe("0")
    expect(value().dataset).toMatchObject({
      labels: "0",
      value: "empty",
      placeholder: "true",
    })

    setConnected(true)
    await vi.waitFor(() => {
      flush()
      expect(value().textContent).toBe(
        customChildren ? "Choices: Apple" : "Apple"
      )
    })
    expect(value().className).toBe("value-apple")
    expect(value().style.getPropertyValue("--labels")).toBe("1")
    expect(value().dataset).toMatchObject({
      labels: "1",
      value: "selected",
      placeholder: "false",
    })

    controller.setValue("Pear")
    await vi.waitFor(() => {
      flush()
      expect(value().textContent).toBe(
        customChildren ? "Choices: Pear" : "Pear"
      )
    })
    expect(value().className).toBe("value-pear")
    expect(root.querySelector("[data-error]")).toBeNull()
    expect([...codes]).toEqual([])
  }
)
