import { afterEach, expect, test, vi } from "vitest"
import { field } from "../src/components/field/field"
import { setAnnouncer } from "../src/foundation/platform/announce"
import {
  attrs,
  partState,
  present,
  subscribe,
} from "../src/foundation/kernel/part"

// The field reads its controls from the DOM, which this environment doesn't
// have, so a stand-in input answers the few questions it asks.
class StubInput {
  name = "email"
  type = "text"
  value = ""
  required = true
  willValidate = true
  form = new EventTarget()
  ownerDocument = new EventTarget()
  focused = false
  get validationMessage() {
    return this.value ? "" : "Fill out this field."
  }
  get validity() {
    return { valid: !!this.value, valueMissing: !this.value }
  }
  hasAttribute(name: string) {
    return name === "required" && this.required
  }
  getAttribute() {
    return null
  }
  closest() {
    return root
  }
  focus() {
    this.focused = true
  }
}

let root: (EventTarget & { ownerDocument: EventTarget }) | undefined

async function bound(options: { invalid?: boolean } = {}) {
  vi.stubGlobal("HTMLInputElement", StubInput)
  vi.stubGlobal("Node", StubInput)
  const control = new StubInput()
  root = Object.assign(new EventTarget(), {
    isConnected: false,
    parentElement: null,
    ownerDocument: control.ownerDocument,
    querySelectorAll: () => [control],
    contains: (node: unknown) => node === control,
    closest: () => null,
  })
  const instance = field({ id: "f", ...options })
  instance.api.internal.bindRoot(root as unknown as HTMLElement)
  // Binding queues a first read of the controls.
  await Promise.resolve()
  return { instance, control }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// What a submit does to an invalid control: an `invalid` event, which doesn't
// bubble, so the field listens in the capture phase on its root.
function submit(control: StubInput) {
  const event = new Event("invalid", { cancelable: true })
  Object.defineProperty(event, "target", { value: control })
  root!.dispatchEvent(event)
  return event
}

// Types into the control. The field hears its `input` event on the document,
// and reads validity a microtask later.
async function type(control: StubInput, value: string) {
  control.value = value
  const event = new Event("input")
  Object.defineProperty(event, "target", { value: control })
  control.ownerDocument.dispatchEvent(event)
  await Promise.resolve()
}

async function reset(control: StubInput) {
  const event = new Event("reset")
  Object.defineProperty(event, "target", { value: control.form })
  control.ownerDocument.dispatchEvent(event)
  await new Promise((resolve) => setTimeout(resolve))
}

test("the browser's validation shows once a submit finds the control invalid", async () => {
  const { instance, control } = await bound()
  expect(present(instance.part("error", {}))).toBe(false)
  expect(partState(instance.part("root"))).toMatchObject({
    invalid: false,
    valid: false,
    required: true,
  })

  submit(control)
  expect(present(instance.part("error", {}))).toBe(true)
  expect(partState(instance.part("error", {}))).toMatchObject({
    invalid: true,
    message: "Fill out this field.",
  })
  expect(attrs(instance.part("control"))).toMatchObject({
    "aria-invalid": "true",
    "data-invalid": "",
  })
  expect(present(instance.part("error", { match: "valueMissing" }))).toBe(true)
  expect(present(instance.part("error", { match: "typeMismatch" }))).toBe(false)
})

test("edits refresh what shows, and a reset hides it again", async () => {
  const { instance, control } = await bound()
  submit(control)
  await type(control, "ada@example.com")
  expect(partState(instance.part("root"))).toMatchObject({
    invalid: false,
    valid: true,
  })
  expect(attrs(instance.part("root"))).toMatchObject({ "data-valid": "" })

  await type(control, "")
  expect(partState(instance.part("root"))).toMatchObject({
    invalid: true,
    valid: false,
  })

  await reset(control)
  expect(partState(instance.part("root"))).toMatchObject({
    invalid: false,
    valid: false,
  })
  expect(present(instance.part("error", {}))).toBe(false)
})

test("an error in the page replaces the browser's message, and the control takes focus", async () => {
  const { instance, control } = await bound()
  // Without an error part, the browser shows its own message.
  expect(submit(control).defaultPrevented).toBe(false)

  // An error part that never shows for this problem doesn't replace it either.
  subscribe(
    instance.part("error", { id: "e", match: "typeMismatch" }),
    () => {}
  )
  expect(submit(control).defaultPrevented).toBe(false)

  instance.part("error", { id: "e" })
  await new Promise((resolve) => setTimeout(resolve))
  expect(submit(control).defaultPrevented).toBe(true)
  expect(control.focused).toBe(true)
})

// A part a framework made in a render it threw away, and never mounted, isn't in the page.
test("an error part nothing holds doesn't replace the browser's message", async () => {
  const { instance, control } = await bound()
  instance.part("error", { id: "e", match: true })
  expect(submit(control).defaultPrevented).toBe(false)
})

// Only an error that shows now replaces the browser's message: one whose
// `match` changed to hide it, or one that left the page, gives it back.
test("an error that stops showing, or leaves the page, gives the message back to the browser", async () => {
  const { instance, control } = await bound()
  const task = () => new Promise((resolve) => setTimeout(resolve))
  const error = instance.part("error", { id: "e", match: true })
  const release = subscribe(error, () => {})
  expect(submit(control).defaultPrevented).toBe(true)
  await task()

  instance.part("error", { id: "e", match: false })
  expect(submit(control).defaultPrevented).toBe(false)
  await task()

  instance.part("error", { id: "e" })
  expect(submit(control).defaultPrevented).toBe(true)
  expect(control.focused).toBe(true)
  await task()

  // An error that unmounts stops counting at once, before the instance drops its part.
  release()
  expect(submit(control).defaultPrevented).toBe(false)
})

test("`invalid` shows the field as invalid right away, with no element", () => {
  const instance = field({ id: "f", invalid: true })
  expect(present(instance.part("error", {}))).toBe(true)
  expect(partState(instance.part("root"))).toMatchObject({
    invalid: true,
    valid: false,
  })
  expect(attrs(instance.part("control"))).toMatchObject({
    "aria-invalid": "true",
    "data-invalid": "",
  })
  // A validity flag is the browser's own validation, which isn't what decides here.
  expect(present(instance.part("error", { match: "valueMissing" }))).toBe(false)
})

test("`invalid={false}` hides the browser's validation, and `match` still decides for itself", async () => {
  const { instance, control } = await bound({ invalid: false })
  submit(control)
  expect(partState(instance.part("root"))).toMatchObject({
    invalid: false,
    valid: false,
  })
  expect(attrs(instance.part("control"))["aria-invalid"]).toBeUndefined()
  expect(present(instance.part("error", {}))).toBe(false)
  expect(present(instance.part("error", { match: true }))).toBe(true)
  expect(present(instance.part("error", { match: false }))).toBe(false)
})

test("passing `invalid`, then leaving it out, starts the browser's validation over", async () => {
  const { instance, control } = await bound()
  submit(control)
  instance.setOptions({ id: "f", invalid: true })
  expect(partState(instance.part("root"))).toMatchObject({
    invalid: true,
    valid: false,
  })

  instance.setOptions({ id: "f" })
  await Promise.resolve()
  expect(partState(instance.part("root"))).toMatchObject({
    invalid: false,
    valid: false,
  })
  expect(present(instance.part("error", {}))).toBe(false)

  submit(control)
  expect(partState(instance.part("root"))).toMatchObject({ invalid: true })
})

test("`valid` never shows while `invalid` is passed, even as false", async () => {
  const { instance, control } = await bound({ invalid: false })
  control.value = "ada@example.com"
  submit(control)
  expect(partState(instance.part("root"))).toMatchObject({ valid: false })
})

// A control with a description of its own, like a date picker's format hint,
// keeps it ahead of the field's descriptions and errors.
test("the control's own description comes before the field's", async () => {
  const { instance } = await bound()
  instance.api.internal.register("descriptions", "f-description")
  instance.api.internal.register("errors", "f-error")
  // Parts register a microtask after they bind.
  await Promise.resolve()
  expect(
    attrs(instance.part("control", { describedBy: "hint" }))["aria-describedby"]
  ).toBe("hint f-description f-error")
  expect(attrs(instance.part("control", {}))["aria-describedby"]).toBe(
    "f-description f-error"
  )
})

// Watches an error element the way the error part does, with a stand-in for
// MutationObserver, which this environment doesn't have.
function watchError(
  instance: Awaited<ReturnType<typeof bound>>["instance"],
  text: string
) {
  let changed = () => {}
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(callback: () => void) {
        changed = callback
      }
      observe() {}
      disconnect() {}
    }
  )
  const el = { textContent: text, isConnected: true, ownerDocument: undefined }
  const unwatch = instance.api.internal.announce(el as unknown as HTMLElement)
  return {
    unwatch,
    write(next: string) {
      el.textContent = next
      changed()
    },
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

test("an error that appears or changes later is announced, one from the first render or a submit isn't", async () => {
  const heard: string[] = []
  setAnnouncer((text) => heard.push(text))
  try {
    const { instance, control } = await bound()
    // A framework can fill the text a moment after the part binds.
    const first = watchError(instance, "")
    await Promise.resolve()
    first.write("Enter your email.")
    await settle()
    expect(heard).toEqual([])

    first.write("Enter a valid email.")
    await settle()
    expect(heard).toEqual(["Enter a valid email."])
    first.unwatch()

    submit(control)
    const revealed = watchError(instance, "")
    revealed.write("Fill out this field.")
    await settle()
    expect(heard).toEqual(["Enter a valid email."])
    revealed.unwatch()

    const later = watchError(instance, "That email is taken.")
    await settle()
    expect(heard).toEqual(["Enter a valid email.", "That email is taken."])
    later.write("That email is taken.")
    await settle()
    expect(heard).toEqual(["Enter a valid email.", "That email is taken."])
    later.unwatch()
  } finally {
    setAnnouncer(undefined)
  }
})
