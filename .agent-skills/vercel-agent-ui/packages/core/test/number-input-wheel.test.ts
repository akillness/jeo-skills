// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { numberInput } from "../src/components/number-input/number-input"
import { mount } from "../src/testing"

afterEach(() => document.body.replaceChildren())

const wheelUp = () =>
  new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true })

test("the wheel steps a focused number input, unless the page canceled the event", () => {
  const view = mount(
    numberInput,
    { defaultValue: 5, wheel: true },
    `<root><group><control aria-label="Quantity"></control></group></root>`
  )
  const control = view.part("control") as HTMLInputElement
  control.focus()
  control.dispatchEvent(wheelUp())
  expect(view.state.value).toBe(6)
  view.root.addEventListener("wheel", (event) => event.preventDefault(), true)
  control.dispatchEvent(wheelUp())
  expect(view.state.value).toBe(6)
  view.unmount()
})
