// @vitest-environment jsdom
import * as React from "react"
import { createRoot, hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { expect, test } from "vitest"
import {
  createSelectController,
  Select,
  SelectTrigger,
  SelectValue,
  type SelectValueState,
} from "../src/select"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.getAnimations ??= () => []

for (const hydrate of [false, true]) {
  for (const callback of ["className", "render"] as const) {
    test(`an external select value connects its ${callback} callback after ${hydrate ? "hydration" : "mount"}`, async () => {
      const controller = createSelectController<string>()
      const states: SelectValueState[] = []
      const count = (state: SelectValueState) => {
        states.push(state)
        return state.labels.length
      }
      const element = (
        <React.StrictMode>
          <SelectTrigger controller={controller} aria-label="Plan">
            {callback === "className" ? (
              <SelectValue
                placeholder="Choose"
                className={(state) => `selected-${count(state)}`}
              />
            ) : (
              <SelectValue
                placeholder="Choose"
                render={(props, state) => (
                  <span {...props} data-count={count(state)} />
                )}
              />
            )}
          </SelectTrigger>
          <Select
            controller={controller}
            items={[{ value: "pro", label: "Pro" }]}
            defaultValue="pro"
          />
        </React.StrictMode>
      )
      const container = document.body.appendChild(document.createElement("div"))
      const errors: unknown[] = []
      const options = {
        onUncaughtError: (error: unknown) => errors.push(error),
        onRecoverableError: (error: unknown) => errors.push(error),
      }
      let root: Root | undefined
      try {
        if (hydrate) {
          container.innerHTML = renderToString(element)
        }
        await React.act(async () => {
          root = hydrate
            ? hydrateRoot(container, element, options)
            : createRoot(container, options)
          if (!hydrate) {
            root.render(element)
          }
        })
        expect(errors).toEqual([])
        expect(states[0]).toEqual({
          value: null,
          label: "",
          labels: [],
          placeholder: true,
        })
        expect(states.at(-1)).toEqual({
          value: "pro",
          label: "Pro",
          labels: ["Pro"],
          placeholder: false,
        })
        const trigger = container.querySelector("button")!
        expect(trigger.textContent).toBe("Pro")
        expect(
          trigger
            .querySelector("span")!
            .getAttribute(callback === "className" ? "class" : "data-count")
        ).toBe(callback === "className" ? "selected-1" : "1")
      } finally {
        await React.act(async () => root?.unmount())
        container.remove()
      }
    })
  }
}
