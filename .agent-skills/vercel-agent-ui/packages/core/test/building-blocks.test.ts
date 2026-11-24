// @vitest-environment jsdom
// The building blocks `@ui-sdk/core` exports for components of your own, used
// the way the Primitives docs show, through the public entry only. `bind` from
// the kernel stands in for an adapter.
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  animateOut,
  announce,
  bindPanel,
  createChange,
  createSelection,
  definePrimitive,
  createFocusRecovery,
  prepareAnnouncements,
  createRovingFocus,
  toLocale,
  type ChangeDetails,
  type PrimitiveInstance,
} from "../src/index"
import { partAttrs, partState, partPresent } from "../src/testing"
import { bind } from "../src/foundation/kernel/part"

type ListOptions = {
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (
    value: string[],
    details: ChangeDetails<"item-press" | "list-navigation">
  ) => void
  multiple?: boolean
  orientation?: "horizontal" | "vertical" | "both"
  columns?: number
  onItemsChange?: () => void
  /** Where PageDown goes from each item, like a calendar paging to a day of next month. */
  pages?: Record<string, string>
}
type ListItemProps = {
  value: string
  disabled?: boolean
  hidden?: boolean
  parent?: string
}

// A list with one tab stop, selection and focus recovery, built from the public blocks.
const list = definePrimitive({
  name: "list",
  options: {
    value: "list",
    defaultValue: "list",
    onValueChange: "callback",
    multiple: "boolean",
    orientation: "string",
    columns: "number",
    onItemsChange: "callback",
    pages: "value",
  },
  controlled: ["value"],
  state: (options: ListOptions) => ({
    value: options.value ?? options.defaultValue ?? [],
    focused: null as string | null,
  }),
  sync: (options) =>
    options.value === undefined ? {} : { value: options.value },
  api: (context) => {
    const change = createChange(context)
    const roving = createRovingFocus<
      { value: string[]; focused: string | null },
      ListItemProps
    >(context, {
      slot: "item",
      key: "focused",
      orientation: () => context.options().orientation ?? "vertical",
      disabled: (item) => !!item.props.disabled,
      focusable: (item) => !item.props.hidden,
      preferred: (item) => context.store.get().value.includes(item.key),
      claims: (state, item) =>
        state.value.length
          ? state.value.includes(item.key)
          : !item.props.disabled,
      move: context.options().pages
        ? (event, { from }) =>
            event.key === "PageDown"
              ? context.options().pages![from.key]
              : undefined
        : context.options().columns
          ? (event, { from, items }) => {
              const columns = context.options().columns!
              const index = items.findIndex((item) => item.key === from.key)
              const by = {
                ArrowRight: 1,
                ArrowLeft: -1,
                ArrowDown: columns,
                ArrowUp: -columns,
              }[event.key]
              return by === undefined ? undefined : items[index + by]?.key
            }
          : undefined,
      onItemsChange: () => context.options().onItemsChange?.(),
    })
    const selection = createSelection(context, {
      key: "value",
      set: (value, details) => change("value", value, details),
      order: () => roving.items().map((item) => item.key),
      multiple: () => !!context.options().multiple,
      selectable: (key) => !context.props<ListItemProps>("item", key)?.disabled,
    })
    const recovery = createFocusRecovery<ListItemProps>({
      fallback: (lost) =>
        lost.props.parent
          ? context.element("item", lost.props.parent)
          : undefined,
    })
    return {
      roving,
      selection,
      recovery,
      keydown(event: KeyboardEvent, el: HTMLElement) {
        const moved = roving.keydown(event, el)
        if (moved?.shift) {
          selection.extend(moved.key, {
            from: moved.from,
            reason: "list-navigation",
            event,
          })
        }
      },
    }
  },
  slots: (slot) => ({
    item: slot<ListItemProps, { selected: boolean }>({
      props: {
        value: "string",
        disabled: "boolean",
        hidden: "boolean",
        parent: "string",
      },
      state: (state, { key }) => ({ selected: state.value.includes(key) }),
      present: (_state, { props }) => !props.hidden,
      attrs: (state, part) => ({
        role: "option",
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      on: { keydown: (event, { el, api }) => api.keydown(event, el!) },
      bind: (el, part) => {
        const cleanups = [
          part.api.roving.bind(el, part),
          part.api.recovery.bind(el, part),
        ]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
  }),
})

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})

const tick = () => new Promise((resolve) => setTimeout(resolve))

function render(
  options: ListOptions,
  items: ListItemProps[],
  container: HTMLElement = document.body
) {
  const instance = list({ id: "l", ...options }) as ReturnType<typeof list> &
    PrimitiveInstance
  const els = new Map<string, HTMLElement>()
  const unbind = new Map<string, () => void>()
  const add = (props: ListItemProps) => {
    const el = document.createElement("div")
    el.textContent = props.value
    const part = instance.part("item", props)
    const write = () => {
      for (const [name, value] of Object.entries(partAttrs(part))) {
        if (value === undefined) {
          el.removeAttribute(name)
        } else {
          el.setAttribute(name, value)
        }
      }
    }
    write()
    cleanups.push(instance.subscribe(write))
    container.append(el)
    const unbound = bind(part, el)
    cleanups.push(unbound)
    unbind.set(props.value, unbound)
    els.set(props.value, el)
  }
  items.forEach(add)
  const press = (key: string, init: KeyboardEventInit = {}) =>
    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      })
    )
  const focused = () => (document.activeElement as HTMLElement).textContent
  const stops = () =>
    [...els.values()]
      .filter((el) => el.getAttribute("tabindex") === "0")
      .map((el) => el.textContent)
  return { instance, els, unbind, add, press, focused, stops }
}

const abc = [{ value: "a" }, { value: "b" }, { value: "c" }]

describe("createRovingFocus", () => {
  test("before items bind, one item claims the stop, so server markup has one", () => {
    const instance = list({ id: "l" }) as PrimitiveInstance
    const tabindex = (value: string, props = {}) =>
      partAttrs(instance.part("item", { value, ...props })).tabindex
    expect([
      tabindex("a", { disabled: true }),
      tabindex("b"),
      tabindex("c"),
    ]).toEqual(["-1", "0", "-1"])
    const selected = list({ id: "m", defaultValue: ["c"] }) as PrimitiveInstance
    const stops = ["a", "b", "c"].map(
      (value) => partAttrs(selected.part("item", { value })).tabindex
    )
    expect(stops).toEqual(["-1", "-1", "0"])
  })

  test("once items bind, the stop goes to the preferred item, and follows focus", async () => {
    const { els, press, focused, stops } = render({ defaultValue: ["b"] }, abc)
    await tick()
    expect(stops()).toEqual(["b"])
    els.get("b")!.focus()
    press("ArrowDown")
    expect(focused()).toBe("c")
    expect(stops()).toEqual(["c"])
    press("ArrowDown")
    expect(focused()).toBe("c")
    press("Home")
    expect(focused()).toBe("a")
    press("End")
    expect(focused()).toBe("c")
  })

  test("items that can't take focus are skipped, and joining or leaving is reported", async () => {
    const onItemsChange = vi.fn()
    const { els, press, focused } = render({ onItemsChange }, [
      { value: "a" },
      { value: "b", hidden: true },
      { value: "c" },
    ])
    await tick()
    expect(onItemsChange).toHaveBeenCalledTimes(1)
    els.get("a")!.focus()
    press("ArrowDown")
    expect(focused()).toBe("c")
  })

  test("horizontal groups swap Left and Right right to left", async () => {
    const container = document.createElement("div")
    container.style.direction = "rtl"
    document.body.append(container)
    const { els, press, focused } = render(
      { orientation: "horizontal" },
      abc,
      container
    )
    await tick()
    els.get("a")!.focus()
    press("ArrowLeft")
    expect(focused()).toBe("b")
    press("ArrowDown")
    expect(focused()).toBe("b")
  })

  test("both orientations use every arrow, with Left and Right swapped right to left", async () => {
    const container = document.createElement("div")
    container.style.direction = "rtl"
    document.body.append(container)
    const { els, press, focused } = render(
      { orientation: "both" },
      abc,
      container
    )
    await tick()
    els.get("a")!.focus()
    press("ArrowDown")
    expect(focused()).toBe("b")
    press("ArrowLeft")
    expect(focused()).toBe("c")
    press("ArrowUp")
    expect(focused()).toBe("b")
    press("ArrowRight")
    expect(focused()).toBe("a")
    press("End")
    expect(focused()).toBe("c")
    press("Home")
    expect(focused()).toBe("a")
  })

  test("a custom move serves any shape, like a grid", async () => {
    const grid = ["a", "b", "c", "d"].map((value) => ({ value }))
    const { els, press, focused } = render({ columns: 2 }, grid)
    await tick()
    els.get("a")!.focus()
    press("ArrowDown")
    expect(focused()).toBe("c")
    press("ArrowRight")
    expect(focused()).toBe("d")
  })

  test("a move to an item that isn't rendered yet focuses it once it binds", async () => {
    const { els, unbind, add, press, focused, stops } = render(
      { pages: { b: "d" } },
      abc
    )
    await tick()
    els.get("b")!.focus()
    press("PageDown")
    // The page turns: the old items leave, which drops focus to the body, and the new ones bind.
    for (const value of ["a", "b", "c"]) {
      unbind.get(value)!()
      els.get(value)!.remove()
    }
    add({ value: "d" })
    add({ value: "e" })
    await tick()
    expect(focused()).toBe("d")
    expect(stops()).toEqual(["d"])
  })

  test("focus follows an item to its new element, like a card an undo moves to another list", async () => {
    const { els, unbind, add, focused } = render({}, abc)
    await tick()
    els.get("b")!.focus()
    // Removed before its cleanup runs, as some frameworks do, and after.
    els.get("b")!.remove()
    unbind.get("b")!()
    add({ value: "b" })
    await tick()
    expect(focused()).toBe("b")
    unbind.get("b")!()
    els.get("b")!.remove()
    add({ value: "b" })
    await tick()
    expect(focused()).toBe("b")
  })

  test("an item that renders again doesn't take focus it didn't have", async () => {
    const { els, unbind, add, focused } = render({}, abc)
    await tick()
    els.get("a")!.focus()
    unbind.get("b")!()
    els.get("b")!.remove()
    add({ value: "b" })
    await tick()
    expect(focused()).toBe("a")
    // Nor focus that went to the page in between.
    els.get("a")!.focus()
    els.get("a")!.blur()
    unbind.get("a")!()
    els.get("a")!.remove()
    add({ value: "a" })
    await tick()
    expect(document.activeElement).toBe(document.body)
  })

  test("a move to an item that can't take focus yet focuses it once it can", async () => {
    const { instance, els, add, press, focused } = render(
      { pages: { b: "d" }, value: [] },
      abc
    )
    add({ value: "d", hidden: true })
    await tick()
    els.get("b")!.focus()
    press("PageDown")
    expect(focused()).toBe("b")
    // The item renders again, focusable, with a change of state, like a calendar's next month.
    instance.part("item", { value: "d" })
    instance.setOptions({ pages: { b: "d" }, value: ["d"] })
    await tick()
    expect(focused()).toBe("d")
  })

  test("a pending move doesn't take focus that went elsewhere meanwhile", async () => {
    const outside = document.createElement("button")
    outside.textContent = "outside"
    document.body.append(outside)
    const { els, add, press, focused } = render({ pages: { b: "d" } }, abc)
    await tick()
    els.get("b")!.focus()
    press("PageDown")
    outside.focus()
    add({ value: "d" })
    await tick()
    expect(focused()).toBe("outside")
  })

  test("a move to an item that never renders gives the stop back to the group's rules", async () => {
    const { els, press, focused, stops } = render({ pages: { b: "z" } }, abc)
    await tick()
    els.get("b")!.focus()
    press("PageDown")
    expect(stops()).toEqual([])
    await tick()
    await tick()
    expect(stops()).toEqual(["b"])
    expect(focused()).toBe("b")
  })

  test("focus on an item that isn't rendered yet waits for it", async () => {
    const { instance, add, focused } = render({}, abc)
    await tick()
    instance.api.roving.focus("d")
    add({ value: "d" })
    await tick()
    expect(focused()).toBe("d")
  })

  test("remember moves the stop to an item whose focus went elsewhere", async () => {
    const { instance, els, focused, stops } = render({}, abc)
    await tick()
    els.get("a")!.focus()
    instance.api.roving.remember("c")
    expect(focused()).toBe("a")
    expect(stops()).toEqual(["c"])
    // The group keeps it there, as it would for an item focused last.
    instance.api.roving.check()
    expect(stops()).toEqual(["c"])
  })

  test("Shift is reported, so a list can extend its selection", async () => {
    const onValueChange = vi.fn()
    const { els, press } = render({ multiple: true, onValueChange }, abc)
    await tick()
    els.get("a")!.focus()
    press("ArrowDown", { shiftKey: true })
    expect(onValueChange).toHaveBeenLastCalledWith(
      ["a", "b"],
      expect.objectContaining({ reason: "list-navigation" })
    )
  })
})

describe("createSelection", () => {
  const setup = async (
    options: ListOptions = {},
    items = [...abc, { value: "d", disabled: true }, { value: "e" }]
  ) => {
    const view = render({ multiple: true, ...options }, items)
    await tick()
    return {
      ...view,
      selection: view.instance.api.selection,
      value: () => view.instance.get().value,
    }
  }
  const why = { reason: "item-press" as const }

  test("choose, toggle and select all", async () => {
    const { selection, value } = await setup()
    selection.choose("b", why)
    expect(value()).toEqual(["b"])
    selection.toggle("c", why)
    expect(value()).toEqual(["b", "c"])
    selection.toggle("b", why)
    expect(value()).toEqual(["c"])
    selection.toggleAll(why)
    expect(value()).toEqual(["c", "a", "b", "e"])
    selection.toggleAll(why)
    expect(value()).toEqual([])
    // Reasons are typed from onValueChange.
    // @ts-expect-error A reason the options don't declare.
    selection.choose("b", { reason: "escape-key" })
  })

  test("ranges start at the anchor, keep its base, skip disabled items and can shrink", async () => {
    const { selection, value } = await setup()
    selection.choose("a", why)
    selection.toggle("c", why)
    selection.extend("e", why)
    expect(value()).toEqual(["a", "c", "e"])
    selection.extend("a", why)
    expect(value()).toEqual(["a", "c", "b"])
    selection.extend("e", { ...why, additive: false })
    expect(value()).toEqual(["c", "e"])
  })

  test("a controlled value that comes back in another order keeps the anchor", async () => {
    let chosen: string[] = []
    const { selection, instance } = await setup()
    // The owner keeps its own order, and hands over a new array on every render.
    const render = () =>
      instance.setOptions({
        id: "l",
        multiple: true,
        value: [...chosen].sort().reverse(),
        onValueChange: (next: string[]) => (chosen = next),
      })
    render()
    selection.toggle("a", why)
    render()
    selection.toggle("b", why)
    render()
    expect(instance.get().value).toEqual(["b", "a"])
    expect(selection.anchor()).toBe("b")
    render()
    expect(selection.anchor()).toBe("b")
    selection.extend("e", why)
    expect(chosen).toEqual(["a", "b", "c", "e"])
  })

  test("a value from outside starts ranges over, and a refused change moves no anchor", async () => {
    const onValueChange = vi.fn(
      (_value: string[], details: { cancel: () => void }) => details.cancel()
    )
    const { selection, value, instance } = await setup()
    selection.choose("a", why)
    instance.setOptions({ id: "l", multiple: true, value: ["e"] })
    expect(selection.anchor()).toBeNull()
    instance.setOptions({ id: "l", multiple: true, onValueChange })
    selection.choose("b", why)
    expect(value()).toEqual(["e"])
    expect(selection.anchor()).toBeNull()
  })

  test("single mode chooses, and toggling the selected item clears it", async () => {
    const { selection, value } = await setup({ multiple: false })
    selection.extend("c", why)
    expect(value()).toEqual(["c"])
    selection.toggleAll(why)
    expect(value()).toEqual(["c"])
    selection.toggle("c", why)
    expect(value()).toEqual([])
  })
})

describe("createFocusRecovery", () => {
  test("focus that leaves with its part goes to the fallback", async () => {
    const { els, unbind } = render({}, [
      { value: "a" },
      { value: "b", parent: "a" },
    ])
    els.get("b")!.focus()
    // Like a framework removing the part: the element goes, then its cleanup runs.
    els.get("b")!.remove()
    unbind.get("b")!()
    await tick()
    expect(document.activeElement).toBe(els.get("a"))
  })

  test("focus that moved elsewhere first stays there", async () => {
    const { els, unbind } = render({}, [
      { value: "a" },
      { value: "b", parent: "a" },
    ])
    const other = document.createElement("button")
    document.body.append(other)
    els.get("b")!.focus()
    other.focus()
    await tick()
    els.get("b")!.remove()
    unbind.get("b")!()
    await tick()
    expect(document.activeElement).toBe(other)
  })
})

describe("bindPanel", () => {
  test("a closing panel settles, and an exiting one reports when its exit ends", () => {
    let open = true
    let exiting = false
    const listeners = new Set<() => void>()
    const settled = vi.fn()
    const exited = vi.fn()
    const sizes: string[] = []
    const el = document.createElement("div")
    el.getAnimations = () => []
    document.body.append(el)
    const cleanup = bindPanel(el, {
      size: (_el, height) => sizes.push(height),
      isOpen: () => open,
      isExiting: () => exiting,
      isFindable: () => false,
      opening: () => "mount",
      reveal: () => {},
      trigger: () => undefined,
      subscribe: (listener) => (
        listeners.add(listener),
        () => listeners.delete(listener)
      ),
      settled,
      exited,
    })
    expect(sizes.at(-1)).toBe("auto")
    open = false
    listeners.forEach((listener) => listener())
    expect(settled).toHaveBeenLastCalledWith(false)
    expect(sizes.at(-1)).toBe("0px")
    open = true
    listeners.forEach((listener) => listener())
    open = false
    exiting = true
    listeners.forEach((listener) => listener())
    // No animation runs, so the exit ends at once.
    expect(exited).toHaveBeenCalledTimes(1)
    expect(el.hasAttribute("data-ending-style")).toBe(false)
    cleanup()
  })
})

describe("animateOut", () => {
  const animating = () => {
    const el = document.createElement("div")
    const animation = { finished: Promise.resolve() } as unknown as Animation
    el.getAnimations = () => [animation]
    document.body.append(el)
    return el
  }

  test("an exited element keeps its ending style until the framework unmounts it", async () => {
    const el = animating()
    const exitingAtUnmount: boolean[] = []
    animateOut(el, () => {
      queueMicrotask(() => {
        exitingAtUnmount.push(
          el.hasAttribute("data-ending-style") && el.hasAttribute("inert")
        )
        el.remove()
      })
    })
    await nextFrames(1)
    expect(exitingAtUnmount).toEqual([true])
  })

  test("an element still mounted after its exit loses its ending style and inert", async () => {
    const el = animating()
    const exitingAtDone: boolean[] = []
    animateOut(el, () =>
      exitingAtDone.push(el.hasAttribute("data-ending-style"))
    )
    await nextFrames(3)
    expect(exitingAtDone).toEqual([true])
    expect(el.hasAttribute("data-ending-style")).toBe(false)
    expect(el.hasAttribute("inert")).toBe(false)
  })

  test("a scroll-driven animation inside doesn't hold the exit", async () => {
    vi.useFakeTimers()
    const el = document.createElement("div")
    const scrolling = {
      finished: new Promise(() => {}),
      timeline: { source: document.body },
      effect: { getComputedTiming: () => ({ endTime: 100_000, localTime: 0 }) },
    } as unknown as Animation
    el.getAnimations = () => [scrolling]
    document.body.append(el)
    const done = vi.fn()
    animateOut(el, done)
    await vi.advanceTimersByTimeAsync(1000)
    expect(done).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
    el.remove()
  })

  test("an inert its owner writes during the exit stays, and one it had before comes back", async () => {
    const el = animating()
    animateOut(el, () => {})
    el.setAttribute("inert", "")
    await nextFrames(3)
    expect(el.hasAttribute("inert")).toBe(true)

    const kept = animating()
    kept.setAttribute("inert", "")
    animateOut(kept, () => {})
    await nextFrames(3)
    expect(kept.hasAttribute("inert")).toBe(true)
  })
})

async function nextFrames(count: number) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
}

describe("reading parts", () => {
  test("attributes, state and presence, the way adapters read them", () => {
    const instance = list({ id: "l", defaultValue: ["a"] }) as PrimitiveInstance
    const part = instance.part("item", { value: "a" })
    expect(partAttrs(part)).toMatchObject({
      "data-slot": "list-item",
      role: "option",
    })
    expect(partState(part)).toEqual({ selected: true })
    expect(
      partPresent(instance.part("item", { value: "b", hidden: true }))
    ).toBe(false)
  })
})

describe("locales", () => {
  test("tags Intl rejects become ones it accepts", () => {
    expect(toLocale("en_US")).toBe("en-US")
    expect(toLocale("de_DE.UTF-8@euro")).toBe("de-DE")
    expect(toLocale("not a tag")).toBeUndefined()
  })
})

describe("announce", () => {
  afterEach(() => {
    vi.useRealTimers()
    for (const region of document.querySelectorAll("[data-ui-sdk-announcer]")) {
      region.remove()
    }
  })

  test("reads text through a live region, politely unless asked to interrupt", () => {
    vi.useFakeTimers()
    prepareAnnouncements(document)
    const polite = document.querySelector('[aria-live="polite"]')!
    const assertive = document.querySelector('[aria-live="assertive"]')!
    expect(polite.getAttribute("role")).toBe("status")
    expect(assertive.getAttribute("role")).toBe("alert")

    announce("Copied")
    // The region empties first, so the same text twice is read twice.
    expect(polite.textContent).toBe("")
    vi.advanceTimersByTime(100)
    expect(polite.textContent).toBe("Copied")

    announce("Couldn't copy", { priority: "assertive" })
    vi.advanceTimersByTime(100)
    expect(assertive.textContent).toBe("Couldn't copy")
    expect(polite.textContent).toBe("Copied")
  })
})
