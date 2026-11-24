// @vitest-environment jsdom
import { renderToString } from "@vue/server-renderer"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  createApp,
  createCommentVNode,
  createSSRApp,
  defineComponent,
  Fragment,
  h,
  nextTick,
  type App,
} from "vue"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsOverflow,
  ComboboxInput,
  ComboboxValue,
} from "../src/combobox"
import { Command, CommandList } from "../src/command"
import { Listbox } from "../src/listbox"
import { Slider, SliderValue } from "../src/slider"
import {
  createToaster,
  Toast,
  ToastDescription,
  ToastRegion,
  ToastTitle,
} from "../src/toast"

// jsdom has no Web Animations API, no popover API and no ResizeObserver,
// which a toast measures itself with.
Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let app: App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

function mount(render: () => unknown) {
  const element = document.body.appendChild(document.createElement("div"))
  app = createApp(defineComponent({ setup: () => render }))
  app.mount(element)
  return element
}

// What a slot holding only `<span v-if="false" />` compiles to.
const nothing = () => [createCommentVNode("v-if", true)]

describe("a part whose content renders nothing shows its own", () => {
  test("a slider's value shows the formatted value", () => {
    const element = mount(() =>
      h(Slider, { defaultValue: 40 }, () => h(SliderValue, null, nothing))
    )
    expect(element.querySelector("output")!.textContent).toBe("40")
  })

  test("a toast's title shows the toast's title", async () => {
    const toaster = createToaster()
    const element = mount(() =>
      h(ToastRegion, { toaster }, () =>
        h(Toast, null, () => h(ToastTitle, null, nothing))
      )
    )
    toaster("Saved")
    await nextTick()
    expect(
      element.querySelector('[data-slot="toast-title"]')!.textContent
    ).toBe("Saved")
  })

  test("a toast's description renders nothing for a toast without one", async () => {
    const toaster = createToaster()
    const element = mount(() =>
      h(ToastRegion, { toaster }, () =>
        h(Toast, null, () => [
          h(ToastTitle),
          h(ToastDescription, null, nothing),
        ])
      )
    )
    toaster("Saved")
    await nextTick()
    expect(element.querySelector('[data-slot="toast-title"]')).not.toBeNull()
    expect(element.querySelector('[data-slot="toast-description"]')).toBeNull()
  })

  test("a data listbox renders its items", () => {
    const element = mount(() =>
      h(Listbox, { items: ["apple", "banana"], "aria-label": "Fruit" }, nothing)
    )
    expect(element.querySelectorAll('[role="option"]')).toHaveLength(2)
  })

  test("a data command's list renders its items", () => {
    const element = mount(() =>
      h(Command, { items: ["Copy", "Paste"], "aria-label": "Actions" }, () =>
        h(CommandList, null, nothing)
      )
    )
    expect(element.querySelectorAll('[role="option"]')).toHaveLength(2)
  })

  test("a data command's list renders its items for an empty fragment, like JSX's <></>", () => {
    const element = mount(() =>
      h(Command, { items: ["Copy", "Paste"], "aria-label": "Actions" }, () =>
        h(CommandList, null, () => [h(Fragment)])
      )
    )
    expect(element.querySelectorAll('[role="option"]')).toHaveLength(2)
  })

  test("a combobox's value shows the value's label", () => {
    const element = mount(() =>
      h(Combobox, { items: ["apple", "banana"], defaultValue: "banana" }, () =>
        h("span", { id: "value" }, h(ComboboxValue, null, nothing))
      )
    )
    expect(element.querySelector("#value")!.textContent).toBe("banana")
  })

  test("a combobox's chips overflow shows how many chips are hidden", () => {
    const element = mount(() =>
      h(
        Combobox,
        { items: ["apple", "banana"], multiple: true, defaultValue: ["apple"] },
        () =>
          h(ComboboxChips, null, () => h(ComboboxChipsOverflow, null, nothing))
      )
    )
    expect(
      element.querySelector('[data-slot="combobox-chips-overflow"]')!
        .textContent
    ).toMatch(/^\+\d+ more$/)
  })

  test("a combobox's chips with nothing selected hydrate the server's markup", async () => {
    const view = () =>
      h(Combobox, { items: ["apple", "banana"], multiple: true }, () =>
        h(ComboboxChips, null, () => [
          h(ComboboxValue, null, ({ value }: { value: string[] }) =>
            value.map((item) => h(ComboboxChip, { key: item, value: item }))
          ),
          h(ComboboxInput),
        ])
      )
    const root = document.body.appendChild(document.createElement("div"))
    root.innerHTML = await renderToString(createSSRApp(view))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    app = createSSRApp(view)
    app.mount(root)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
