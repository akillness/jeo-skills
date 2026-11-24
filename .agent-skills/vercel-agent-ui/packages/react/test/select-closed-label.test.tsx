// @vitest-environment jsdom
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, test } from "vitest"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../src/select"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.getAnimations ??= () => []

test("a closed select shows its item's label after the label changes", async () => {
  let bump = () => {}
  function Demo() {
    const [count, setCount] = React.useState(0)
    bump = () => setCount((n) => n + 1)
    return (
      <Select defaultValue="a">
        <SelectTrigger aria-label="Pick">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Unknown · {count}</SelectItem>
        </SelectContent>
      </Select>
    )
  }
  const container = document.body.appendChild(document.createElement("div"))
  const root = createRoot(container)
  await act(async () => root.render(<Demo />))
  const value = () =>
    container.querySelector('[data-slot="select-value"]')?.textContent
  expect(value()).toBe("Unknown · 0")
  await act(async () => bump())
  expect(value()).toBe("Unknown · 1")
  await act(async () => root.unmount())
  container.remove()
})
