import { afterEach, describe, expect, test, vi } from "vitest"
import { textarea } from "../src/components/input/input"
import { attrs, bind } from "../src/foundation/kernel/part"
import { setPlatform } from "../src/foundation/platform/platform"

// Stands in for a <textarea> with a 1px border, 8px padding and 20px lines.
// `value` sits on its prototype like the real one, so a field can watch writes.
class FakeTextarea extends EventTarget {
  #value = ""
  get value() {
    return this.#value
  }
  set value(value: string) {
    this.#value = value
  }
  disabled = false
  readOnly = false
  form: { requestSubmit: () => void } | null = null
  isConnected = true
  selectionStart = 0
  ownerDocument = new EventTarget()
  style = {
    height: "",
    fieldSizing: "",
    setProperty(name: string, value: string) {
      if (name === "field-sizing") {
        this.fieldSizing = value
      }
    },
    removeProperty(name: string) {
      if (name === "height") {
        this.height = ""
      }
      if (name === "field-sizing") {
        this.fieldSizing = ""
      }
    },
  }
  get scrollHeight() {
    return 16 + 20 * this.#value.split("\n").length
  }
  get offsetHeight() {
    return this.style.height === "auto" || this.style.height === ""
      ? this.scrollHeight + 2
      : parseFloat(this.style.height)
  }
  get clientHeight() {
    return this.offsetHeight - 2
  }
  setSelectionRange() {}
}

function setup(options: { autoResize?: boolean; defaultValue?: string } = {}) {
  const el = new FakeTextarea()
  el.value = options.defaultValue ?? ""
  const instance = textarea({ id: "t", ...options })
  const unbind = bind(instance.part("root", {}), el as unknown as HTMLElement, {
    by: "framework",
    attaches: "all",
  })
  return { el, instance, unbind }
}

// Binds with core attaching the listeners, so dispatched keys reach the root's handlers.
function setupKeys(
  options: {
    submitShortcut?: "enter" | "mod+enter"
    onSubmit?: () => void
  } = {}
) {
  const el = new FakeTextarea()
  el.value = "Hi Hollis"
  el.form = { requestSubmit: vi.fn() }
  const instance = textarea({ id: "t", defaultValue: "Hi Hollis", ...options })
  const unbind = bind(instance.part("root", {}), el as unknown as HTMLElement, {
    by: "framework",
    attaches: [],
  })
  const press = (keys: Partial<KeyboardEvent> = {}) => {
    const event = Object.assign(new Event("keydown", { cancelable: true }), {
      key: "Enter",
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      isComposing: false,
      ...keys,
    })
    el.dispatchEvent(event)
    return event
  }
  return { el, instance, unbind, press, requestSubmit: el.form.requestSubmit }
}

afterEach(() => {
  vi.unstubAllGlobals()
  setPlatform("other")
})

describe("textarea", () => {
  test("marks its state with data attributes", () => {
    const instance = textarea({ id: "t", defaultValue: "Hello" })
    expect(
      attrs(
        instance.part("root", {
          disabled: true,
          readOnly: true,
          required: true,
        })
      )
    ).toMatchObject({
      "data-filled": "",
      "data-disabled": "",
      "data-readonly": "",
      "data-required": "",
    })
    instance.api.clear()
    expect(attrs(instance.part("root", {}))).toMatchObject({
      "data-filled": undefined,
      "data-disabled": undefined,
      "data-readonly": undefined,
      "data-required": undefined,
    })
  })

  test("without autoResize, it leaves its height alone", () => {
    const { el, unbind } = setup()
    el.value = "One\nTwo\nThree"
    expect(el.style.height).toBe("")
    unbind()
  })

  test("with autoResize, it fits its text after typing, writes from code and controller changes", () => {
    const { el, instance, unbind } = setup({ autoResize: true })
    expect(el.style.height).toBe("38px")
    el.value = "One\nTwo\nThree"
    expect(el.style.height).toBe("78px")
    instance.api.setValue("One")
    expect(el.style.height).toBe("38px")
    // Typing changes the value without going through the \`value\` setter.
    Object.getOwnPropertyDescriptor(FakeTextarea.prototype, "value")!.set!.call(
      el,
      "One\nTwo"
    )
    el.dispatchEvent(new Event("input"))
    expect(el.style.height).toBe("58px")
    unbind()
    expect(el.style.height).toBe("")
    expect(Object.getOwnPropertyDescriptor(el, "value")).toBeUndefined()
  })

  test("with autoResize, browsers with field-sizing size it with CSS", () => {
    vi.stubGlobal("CSS", {
      supports: (property: string, value: string) =>
        property === "field-sizing" && value === "content",
    })
    const { el, unbind } = setup({ autoResize: true, defaultValue: "One\nTwo" })
    expect(el.style.fieldSizing).toBe("content")
    expect(el.style.height).toBe("")
    unbind()
    expect(el.style.fieldSizing).toBe("")
  })

  test("turning autoResize on or off after binding starts or stops fitting", () => {
    const { el, instance, unbind } = setup({ defaultValue: "One\nTwo" })
    expect(el.style.height).toBe("")
    instance.setOptions({ id: "t", defaultValue: "One\nTwo", autoResize: true })
    expect(el.style.height).toBe("58px")
    instance.setOptions({ id: "t", defaultValue: "One\nTwo" })
    expect(el.style.height).toBe("")
    el.value = "One\nTwo\nThree"
    expect(el.style.height).toBe("")
    unbind()
  })

  describe("submitShortcut", () => {
    test("without it, Enter starts a new line and nothing submits", () => {
      const { press, requestSubmit, unbind } = setupKeys()
      expect(press().defaultPrevented).toBe(false)
      expect(press({ ctrlKey: true }).defaultPrevented).toBe(false)
      expect(requestSubmit).not.toHaveBeenCalled()
      unbind()
    })

    test("with enter, Enter submits the form and Shift+Enter starts a new line", () => {
      const { press, requestSubmit, unbind } = setupKeys({
        submitShortcut: "enter",
      })
      expect(press({ shiftKey: true }).defaultPrevented).toBe(false)
      expect(press({ ctrlKey: true }).defaultPrevented).toBe(false)
      expect(requestSubmit).not.toHaveBeenCalled()
      expect(press().defaultPrevented).toBe(true)
      expect(requestSubmit).toHaveBeenCalledTimes(1)
      unbind()
    })

    test("with mod+enter, Ctrl+Enter submits and Enter starts a new line", () => {
      const { press, requestSubmit, unbind } = setupKeys({
        submitShortcut: "mod+enter",
      })
      expect(press().defaultPrevented).toBe(false)
      expect(press({ metaKey: true }).defaultPrevented).toBe(false)
      expect(press({ ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(
        false
      )
      expect(requestSubmit).not.toHaveBeenCalled()
      expect(press({ ctrlKey: true }).defaultPrevented).toBe(true)
      expect(requestSubmit).toHaveBeenCalledTimes(1)
      unbind()
    })

    test("with mod+enter on Apple platforms, Command+Enter submits", () => {
      setPlatform("apple")
      const { press, requestSubmit, unbind } = setupKeys({
        submitShortcut: "mod+enter",
      })
      expect(press({ ctrlKey: true }).defaultPrevented).toBe(false)
      expect(press({ metaKey: true }).defaultPrevented).toBe(true)
      expect(requestSubmit).toHaveBeenCalledTimes(1)
      unbind()
    })

    test("onSubmit gets the value and the key press instead of the form submitting", () => {
      const onSubmit = vi.fn()
      const { press, requestSubmit, unbind } = setupKeys({
        submitShortcut: "enter",
        onSubmit,
      })
      const event = press()
      expect(onSubmit).toHaveBeenCalledWith("Hi Hollis", { event })
      expect(requestSubmit).not.toHaveBeenCalled()
      unbind()
    })

    test("outside a form and without onSubmit, the shortcut leaves Enter to add a line", () => {
      const { el, press, unbind } = setupKeys({ submitShortcut: "enter" })
      el.form = null
      expect(press().defaultPrevented).toBe(false)
      unbind()
    })

    test("outside a form, onSubmit still runs on the shortcut", () => {
      const onSubmit = vi.fn()
      const { el, press, unbind } = setupKeys({
        submitShortcut: "mod+enter",
        onSubmit,
      })
      el.form = null
      expect(press({ ctrlKey: true }).defaultPrevented).toBe(true)
      expect(onSubmit).toHaveBeenCalledTimes(1)
      unbind()
    })

    test("nothing submits while an input method composes", () => {
      const onSubmit = vi.fn()
      const { press, unbind } = setupKeys({ submitShortcut: "enter", onSubmit })
      expect(press({ isComposing: true }).defaultPrevented).toBe(false)
      // Safari ends a composition with isComposing false and key code 229.
      expect(press({ keyCode: 229 }).defaultPrevented).toBe(false)
      expect(onSubmit).not.toHaveBeenCalled()
      unbind()
    })

    test("setting it after binding takes effect on the next key press", () => {
      const { instance, press, requestSubmit, unbind } = setupKeys()
      press()
      instance.setOptions({
        id: "t",
        defaultValue: "Hi Hollis",
        submitShortcut: "enter",
      })
      press()
      expect(requestSubmit).toHaveBeenCalledTimes(1)
      unbind()
    })
  })
})
