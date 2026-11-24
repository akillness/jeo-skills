// @vitest-environment node
import { renderToString } from "react-dom/server"
import { expect, test } from "vitest"
import {
  createSelectController,
  Select,
  SelectTrigger,
  SelectValue,
} from "../src/select"

for (const external of [false, true]) {
  for (const callback of ["className", "render"] as const) {
    test(`${external ? "external" : "nested"} select value gives ${callback} the empty selection state on the server`, () => {
      const controller = createSelectController()
      const value =
        callback === "className" ? (
          <SelectValue
            placeholder="Choose"
            className={(state) => `selected-${state.labels.length}`}
          />
        ) : (
          <SelectValue
            placeholder="Choose"
            render={(props, state) => (
              <span {...props} data-count={state.labels.length} />
            )}
          />
        )
      const trigger = (
        <SelectTrigger controller={controller}>{value}</SelectTrigger>
      )
      const html = renderToString(
        external ? (
          <>
            {trigger}
            <Select controller={controller} items={["a"]} />
          </>
        ) : (
          <Select controller={controller} items={["a"]}>
            {trigger}
          </Select>
        )
      )
      expect(html).toContain("Choose")
      expect(html).toContain(
        callback === "className" ? 'class="selected-0"' : 'data-count="0"'
      )
    })
  }
}

test("an external select value preserves static children before its select connects", () => {
  const controller = createSelectController()
  const html = renderToString(
    <SelectTrigger controller={controller}>
      <SelectValue placeholder="Choose" className="value">
        Choose a plan
      </SelectValue>
    </SelectTrigger>
  )
  expect(html).toContain('<span class="value">Choose a plan</span>')
})

test("an external select value gives style and children callbacks the empty selection state", () => {
  const controller = createSelectController()
  const html = renderToString(
    <SelectTrigger controller={controller}>
      <SelectValue
        style={(state) => ({ opacity: state.placeholder ? 0.5 : 1 })}
      >
        {(state) => {
          expect(state).toEqual({
            value: null,
            label: "",
            labels: [],
            placeholder: true,
          })
          return state.label.toUpperCase() || "Choose a plan"
        }}
      </SelectValue>
    </SelectTrigger>
  )
  expect(html).toContain('<span style="opacity:0.5">Choose a plan</span>')
})
