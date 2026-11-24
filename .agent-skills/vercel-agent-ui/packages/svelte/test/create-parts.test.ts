import { flushSync, mount, unmount } from "svelte"
import { afterEach, describe, expect, test } from "vitest"
import App from "./apps/picker-app.svelte"
import ControlledApp from "./apps/picker-controlled-app.svelte"
import ListboxApp from "./apps/listbox-parts-app.svelte"
import ParentApp from "./apps/picker-parent-app.svelte"

afterEach(() => document.body.replaceChildren())

function setup(props: Record<string, unknown>) {
  const app = mount(App, { target: document.body, props })
  flushSync()
  const button = (name: string) =>
    [...document.querySelectorAll("button")].find((el) =>
      el.textContent?.startsWith(name)
    )!
  return {
    app,
    button,
    output: () => document.querySelector("output")!.textContent,
  }
}

describe("parts from createParts", () => {
  test("a nested part's handler reads the value it took from the part around it", () => {
    const { app, button, output } = setup({ defaultValue: "apple" })
    button("pear").click()
    flushSync()
    expect(output()).toBe("pear")
    expect(button("pear").textContent).toBe("pear (picked)")
    unmount(app)
  })

  test("an option with a change callback writes back through bind:", () => {
    // The app binds its own `value` to the root's, and its parent here is this accessor.
    let value = "apple"
    const { app, button } = setup({
      get value() {
        return value
      },
      set value(next: string) {
        value = next
      },
    })
    button("pear").click()
    flushSync()
    expect(value).toBe("pear")
    unmount(app)
  })

  test("an option passed without bind: changes locally, like a bindable prop", () => {
    const app = mount(ControlledApp, {
      target: document.body,
      props: { value: "apple" },
    })
    flushSync()
    document.querySelector("button")!.click()
    flushSync()
    expect(document.querySelector("output")!.textContent).toBe("pear")
    unmount(app)
  })

  test("a value the parent passes again after another replaces a local change", () => {
    const app = mount(ParentApp, { target: document.body })
    flushSync()
    document.querySelector("button")!.click()
    flushSync()
    app.set("plum")
    flushSync()
    app.set("apple")
    flushSync()
    expect(document.querySelector("output")!.textContent).toBe("apple")
    unmount(app)
  })

  test("object values key their items by itemToValue", () => {
    const app = mount(ListboxApp, { target: document.body })
    flushSync()
    const options = [...document.querySelectorAll<HTMLElement>("[role=option]")]
    expect(new Set(options.map((option) => option.id)).size).toBe(2)
    options[1].click()
    flushSync()
    expect(
      options.map((option) => option.getAttribute("aria-selected"))
    ).toEqual(["false", "true"])
    unmount(app)
  })

  test("a required part outside the part it needs throws", () => {
    expect(() =>
      mount(ListboxApp, { target: document.body, props: { stray: true } })
    ).toThrow("A listbox item-indicator part must be used inside its item.")
  })

  test("generated ids are unique per part", () => {
    const { app } = setup({})
    const ids = [...document.querySelectorAll("button")].map((el) => el.id)
    expect(new Set(ids).size).toBe(2)
    expect(ids.every(Boolean)).toBe(true)
    unmount(app)
  })
})
