// @vitest-environment jsdom
// Presses that keep focus where it is, like in a combobox's field while its
// list is pressed, so typing goes on.
import { afterEach, describe, expect, test } from "vitest"
import { tokenInput } from "../src/components/token-input/token-input"
import { pressKeepsFocus } from "../src/foundation/focus/press-keeps-focus"
import { bind } from "../src/foundation/kernel/part"

afterEach(() => document.body.replaceChildren())

function press(target: Element) {
  const event = new PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

function list(html: string) {
  const el = document.createElement("div")
  el.innerHTML = html
  document.body.append(el)
  el.addEventListener("pointerdown", (event) =>
    pressKeepsFocus.pointerdown(event, { el })
  )
  return el
}

describe("pressKeepsFocus", () => {
  test("a press on the element keeps focus where it is", () => {
    const el = list("<span>Apple</span>")
    expect(press(el.querySelector("span")!).defaultPrevented).toBe(true)
  })

  test("a press on a field inside the element focuses the field", () => {
    const el = list(
      '<input aria-label="Search"><div contenteditable="true"><b>Note</b></div>'
    )
    expect(press(el.querySelector("input")!).defaultPrevented).toBe(false)
    expect(press(el.querySelector("b")!).defaultPrevented).toBe(false)
  })

  test("a press on a field a portal renders from inside the element focuses the field", () => {
    const el = list("<span>Apple</span>")
    const input = document.createElement("input")
    document.body.append(input)
    // React passes a portal's events to the parts around it in its tree.
    input.addEventListener("pointerdown", (event) =>
      pressKeepsFocus.pointerdown(event, { el })
    )
    expect(press(input).defaultPrevented).toBe(false)
  })

  test("a press on a part's non-editable item inside an editor keeps the caret in the editor", () => {
    const editor = document.createElement("div")
    editor.contentEditable = "true"
    document.body.append(editor)
    const el = document.createElement("div")
    el.innerHTML = '<span contenteditable="false"><b>Item</b></span>'
    editor.append(el)
    el.addEventListener("pointerdown", (event) =>
      pressKeepsFocus.pointerdown(event, { el })
    )
    expect(press(el.querySelector("b")!).defaultPrevented).toBe(true)
  })

  test("a press on a token's remove button keeps the caret in the editor around it", () => {
    const editor = document.createElement("div")
    editor.contentEditable = "true"
    editor.innerHTML =
      '<span contenteditable="false"><button type="button">Remove</button></span>'
    document.body.append(editor)
    const instance = tokenInput({ id: "t" })
    const button = editor.querySelector("button")!
    const unbind = bind(instance.part("token-remove", { token: "a" }), button)
    expect(press(button).defaultPrevented).toBe(true)
    unbind()
  })
})
