import { renderToString } from "@solidjs/web"
import type { ComponentProps } from "solid-js"
import { expect, test } from "vitest"
import {
  createSelectController,
  Select,
  SelectTrigger,
  SelectValue,
} from "../src/select"

function outsideValue(props: ComponentProps<typeof SelectValue>) {
  const controller = createSelectController<string>()
  return renderToString(() => (
    <>
      <SelectTrigger controller={controller}>
        <SelectValue placeholder="Pick" {...props} />
      </SelectTrigger>
      <Select controller={controller} items={["Apple"]} defaultValue="Apple" />
    </>
  ))
}

test("an external value class callback receives an empty label on the server", () => {
  const html = outsideValue({
    class: (state) => `value-${state.label.toLowerCase()}`,
  })
  expect(html).toContain('class="value-"')
  expect(html).toContain("Pick")
})

test("an external value style callback receives an empty labels list on the server", () => {
  const html = outsideValue({
    style: (state) => ({ "--labels": state.labels.length }),
  })
  expect(html).toContain("--labels:0")
  expect(html).toContain("Pick")
})

test("an external value render callback receives placeholder state on the server", () => {
  const html = outsideValue({
    render: (props, state) => (
      <span
        {...props}
        data-labels={state.labels.length}
        data-value={state.value === null ? "empty" : "selected"}
        data-placeholder={String(state.placeholder)}
      />
    ),
  })
  expect(html).toContain('data-labels="0"')
  expect(html).toContain('data-value="empty"')
  expect(html).toContain('data-placeholder="true"')
  expect(html).toContain("Pick")
})

test("an external value keeps its children callback on the server", () => {
  const html = outsideValue({
    children: (state) => `Choices: ${state.labels.length}`,
  })
  expect(html).toContain("Choices: 0")
  expect(html).not.toContain("Pick")
})

test("an internal value renders callbacks with its selected state on the server", () => {
  const html = renderToString(() => (
    <Select items={["Apple"]} defaultValue="Apple">
      <SelectTrigger>
        <SelectValue
          class={(state) => state.label.toLowerCase()}
          style={(state) => ({ "--labels": state.labels.length })}
          render={(props, state) => (
            <span {...props} data-placeholder={String(state.placeholder)} />
          )}
        >
          {(state) => state.label}
        </SelectValue>
      </SelectTrigger>
    </Select>
  ))
  expect(html).toContain('class="apple"')
  expect(html).toContain("--labels:1")
  expect(html).toContain('data-placeholder="false"')
  expect(html).toContain("Apple")
})
