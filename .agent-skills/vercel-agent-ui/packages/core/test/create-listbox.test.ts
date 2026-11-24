// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  createListbox,
  definePrimitive,
  type ListData,
  type ListFilter,
  type ListHighlightDetails,
  type ListboxBehavior,
  type PrimitiveInstance,
} from "../src/index"
import { partAttrs, partPresent } from "../src/testing"
import { bind } from "../src/foundation/kernel/part"

type PickerOptions = {
  focus?: "real" | "virtual"
  items?: ListData
  filter?: ListFilter
  loop?: boolean
  onEnd?: () => void
  onHighlight?: (key: string | null, details: ListHighlightDetails) => void
}
type OptionProps = { value: string; label?: string; disabled?: boolean }

const picker = definePrimitive({
  name: "picker",
  options: {
    focus: "string",
    items: "value",
    filter: "value",
    loop: "boolean",
    onEnd: "callback",
    onHighlight: "callback",
  },
  state: (_options: PickerOptions) => ({
    query: "",
    highlighted: null as string | null,
    chosen: null as string | null,
  }),
  api: (context) => ({
    search: (query: string) => context.store.set({ query }),
    choose: (key: string) => context.store.set({ chosen: key }),
    listbox: createListbox(context, {
      key: "highlighted",
      focus: context.options().focus,
      items: context.options().items && (() => context.options().items!),
      query: () => context.store.get().query,
      filter: () => context.options().filter ?? "contains",
      loop: () => context.options().loop ?? true,
      onEnd: () => context.options().onEnd?.(),
      onHighlight: (key, details) =>
        context.options().onHighlight?.(key, details),
    }),
  }),
  slots: (slot) => ({
    input: slot({
      attrs: (state, { api }) => ({
        role: "combobox",
        "aria-activedescendant": api.listbox.activeId(state),
      }),
      on: {
        keydown(event, { api, store }) {
          const highlighted = store.get().highlighted
          if (event.key === "Enter" && highlighted !== null) {
            api.choose(highlighted)
            return
          }
          api.listbox.keydown(event)
        },
      },
    }),
    option: slot<OptionProps>({
      role: "option",
      focus: "active-descendant",
      press: ({ key, api }) => api.choose(key),
      props: { value: "string", label: "string", disabled: "boolean" },
      present: (_state, part) => part.api.listbox.shows(part),
      attrs: (state, part) => ({
        ...part.api.listbox.attrs(state, part),
        "aria-selected": String(state.chosen === part.key),
      }),
      on: { keydown: (event, { api }) => api.listbox.keydown(event) },
      bind: (el, part) => part.api.listbox.bind(el, part),
    }),
  }),
})

type PickerApi = {
  search: (query: string) => void
  choose: (key: string) => void
  listbox: ListboxBehavior
}

const apiOf = (instance: PrimitiveInstance) => instance.api as PickerApi

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})

const tick = () => new Promise((resolve) => setTimeout(resolve))

function write(el: HTMLElement, attrs: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined) {
      el.removeAttribute(name)
    } else {
      el.setAttribute(name, value)
    }
  }
}

// `deferred` mounts and unmounts options in a microtask after a change, the
// way frameworks that batch their renders do.
function render(
  options: PickerOptions,
  values: OptionProps[],
  { deferred = false } = {}
) {
  const instance = picker({ id: "p", ...options }) as PrimitiveInstance
  const input = document.createElement("input")
  const list = document.createElement("div")
  list.setAttribute("role", "listbox")
  list.tabIndex = -1
  document.body.append(input, list)
  const inputPart = instance.part("input", {})
  cleanups.push(bind(inputPart, input))
  const elements = values.map(() => document.createElement("div"))
  values.forEach((props, index) => {
    const el = elements[index]
    el.textContent = props.label ?? props.value
    const part = instance.part("option", props)
    let unbind: (() => void) | undefined
    const sync = () => {
      const present = partPresent(part)
      if (present && !el.isConnected) {
        const next = elements
          .slice(elements.indexOf(el) + 1)
          .find((other) => other.isConnected)
        list.insertBefore(el, next ?? null)
        unbind = bind(part, el)
      } else if (!present && el.isConnected) {
        unbind?.()
        el.remove()
      }
      write(el, partAttrs(part))
    }
    sync()
    cleanups.push(
      instance.subscribe(() => (deferred ? queueMicrotask(sync) : sync())),
      () => unbind?.()
    )
  })
  const syncInput = () => write(input, partAttrs(inputPart))
  syncInput()
  cleanups.push(instance.subscribe(syncInput))
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    })
    ;(document.activeElement as HTMLElement).dispatchEvent(event)
    return event
  }
  const type = (query: string) => apiOf(instance).search(query)
  const highlighted = () =>
    (instance.get() as { highlighted: string | null }).highlighted
  const shown = () =>
    [...list.children].map((el) => (el as HTMLElement).textContent)
  return {
    instance,
    input,
    list,
    options: elements,
    press,
    type,
    highlighted,
    shown,
  }
}

const fruits = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry", disabled: true },
  { value: "date", label: "Date" },
]

describe("createListbox", () => {
  test("options render their attributes on the server, before anything binds", () => {
    const instance = picker({ id: "p" }) as PrimitiveInstance
    expect(
      partAttrs(instance.part("option", { value: "apple", disabled: true }))
    ).toMatchObject({
      id: "p-option-apple",
      role: "option",
      tabindex: "-1",
      "aria-disabled": "true",
    })
    expect(
      partAttrs(instance.part("input", {}))["aria-activedescendant"]
    ).toBeUndefined()
  })

  test("with virtual focus, the arrows move the highlight and focus stays in the input", async () => {
    const { input, options, press, highlighted } = render(
      { focus: "virtual" },
      fruits
    )
    await tick()
    input.focus()
    press("ArrowDown")
    expect(highlighted()).toBe("apple")
    expect(input.getAttribute("aria-activedescendant")).toBe("p-option-apple")
    expect(options[0].hasAttribute("data-highlighted")).toBe(true)
    expect(options[0].hasAttribute("tabindex")).toBe(false)
    press("ArrowDown")
    press("ArrowDown")
    expect(highlighted()).toBe("date")
    expect(document.activeElement).toBe(input)
    press("ArrowUp")
    expect(highlighted()).toBe("banana")
    expect(press("Home").defaultPrevented).toBe(false)
    press("Enter")
    expect(options[1].getAttribute("aria-selected")).toBe("true")
  })

  test("moving past either end wraps, or stops without loop", async () => {
    const wraps = render({ focus: "virtual" }, fruits)
    await tick()
    wraps.input.focus()
    wraps.press("ArrowUp")
    expect(wraps.highlighted()).toBe("date")
    wraps.press("ArrowDown")
    expect(wraps.highlighted()).toBe("apple")
    cleanups.splice(0).forEach((cleanup) => cleanup())
    document.body.replaceChildren()
    const stops = render({ focus: "virtual", loop: false }, fruits)
    await tick()
    stops.input.focus()
    stops.press("ArrowUp")
    stops.press("ArrowDown")
    expect(stops.highlighted()).toBe("date")
  })

  test("typing filters the bound options, and the highlight leaves with its option", async () => {
    const { input, press, type, highlighted, shown, instance } = render(
      { focus: "virtual" },
      fruits
    )
    await tick()
    input.focus()
    press("ArrowDown")
    expect(highlighted()).toBe("apple")
    type("an")
    await tick()
    expect(shown()).toEqual(["Banana"])
    expect(highlighted()).toBeNull()
    expect(apiOf(instance).listbox.count()).toBe(1)
    press("ArrowDown")
    expect(highlighted()).toBe("banana")
    type("")
    await tick()
    expect(shown()).toEqual(["Apple", "Banana", "Cherry", "Date"])
  })

  test("with real focus, the keys move focus, and Home, End and typing find options", async () => {
    const { options, press, highlighted } = render({}, fruits)
    await tick()
    options[0].focus()
    press("ArrowDown")
    expect(document.activeElement).toBe(options[1])
    press("End")
    expect(document.activeElement).toBe(options[3])
    press("Home")
    expect(highlighted()).toBe("apple")
    press("d")
    expect(document.activeElement).toBe(options[3])
    expect(press(" ").defaultPrevented).toBe(false)
  })

  test("data items render filtered, and a function filter ranks them", async () => {
    const items: ListData = [
      "Apple",
      { type: "separator" },
      { type: "group", label: "Berries", items: ["Blueberry", "Raspberry"] },
    ]
    const instance = picker({
      id: "p",
      items,
      filter: (item, query) =>
        item.label.toLowerCase().startsWith(query)
          ? 2
          : item.label.toLowerCase().includes(query)
            ? 1
            : 0,
    }) as PrimitiveInstance
    const { listbox, search } = apiOf(instance)
    expect(listbox.items()).toBe(items)
    search("r")
    expect(listbox.items()).toEqual([
      { type: "group", label: "Berries", items: ["Raspberry", "Blueberry"] },
    ])
    expect(listbox.count()).toBe(2)
  })

  test("the highlight reports its index, and reaching the last option asks for the next page", async () => {
    const onEnd = vi.fn()
    const onHighlight = vi.fn()
    const { input, press } = render(
      { focus: "virtual", onEnd, onHighlight },
      fruits
    )
    await tick()
    input.focus()
    press("ArrowDown")
    expect(onHighlight).toHaveBeenLastCalledWith(
      "apple",
      expect.objectContaining({ index: 0 })
    )
    expect(onEnd).not.toHaveBeenCalled()
    press("ArrowDown", { metaKey: true })
    expect(onHighlight).toHaveBeenLastCalledWith(
      "date",
      expect.objectContaining({ index: 3 })
    )
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  test("the highlighted option leaving the list reports no highlight", async () => {
    const onHighlight = vi.fn()
    const { input, press, type, highlighted } = render(
      { focus: "virtual", onHighlight },
      fruits
    )
    await tick()
    input.focus()
    press("ArrowDown")
    expect(onHighlight).toHaveBeenLastCalledWith(
      "apple",
      expect.objectContaining({ index: 0 })
    )
    type("ban")
    await tick()
    expect(highlighted()).toBe(null)
    expect(onHighlight).toHaveBeenLastCalledWith(
      null,
      expect.objectContaining({ index: -1 })
    )
  })

  test("with real focus, focus that lands on an option another way highlights it", async () => {
    const { options, highlighted } = render({}, fruits)
    await tick()
    options[1].focus()
    expect(highlighted()).toBe("banana")
    expect(document.activeElement).toBe(options[1])
  })

  test("an empty list highlights nothing, so Enter can't choose a hidden option", async () => {
    const instance = picker({
      id: "p",
      focus: "virtual",
      items: ["Apple", "Banana"],
    }) as PrimitiveInstance
    const { listbox, search } = apiOf(instance)
    listbox.move("first")
    expect(instance.get()).toMatchObject({ highlighted: "Apple" })
    search("zz")
    listbox.move("first")
    expect(instance.get()).toMatchObject({ highlighted: null })
    expect(listbox.activeId(instance.get() as never)).toBeUndefined()
  })

  test("the first match stays highlighted while options mount after the query changes", async () => {
    const { instance, input, press, type, highlighted } = render(
      { focus: "virtual" },
      fruits,
      { deferred: true }
    )
    await tick()
    input.focus()
    type("an")
    await tick()
    type("")
    apiOf(instance).listbox.move("first")
    expect(highlighted()).toBe("banana")
    await tick()
    expect(highlighted()).toBe("apple")
    press("ArrowDown")
    await tick()
    expect(highlighted()).toBe("banana")
  })

  test("with real focus, focus returns to the list when its option leaves", async () => {
    const { list, options, type } = render({}, fruits)
    await tick()
    options[3].focus()
    type("an")
    await tick()
    expect(document.activeElement).toBe(list)
  })
})
