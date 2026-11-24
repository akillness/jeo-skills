// @vitest-environment jsdom
// A color scheme, read through a fake window so each test owns its query.
// `bind` from the kernel stands in for an adapter.
import { afterEach, expect, test } from "vitest"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { bind } from "../src/foundation/kernel/part"
import {
  createColorScheme,
  type ColorSchemeState,
  type ColorSchemeValue,
} from "../src/foundation/preferences/color-scheme"
import {
  createCookieStorage,
  createLocalStorage,
} from "../src/foundation/storage/storage"

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
})

// A window whose `prefers-color-scheme: dark` query a test can flip. A browser
// without the feature reports the query's media as "not all".
function fakeWindow(dark = false, { supported = true } = {}) {
  const listeners = new Set<() => void>()
  let queries = 0
  const query = {
    media: supported ? "(prefers-color-scheme: dark)" : "not all",
    get matches() {
      return supported && dark
    },
    addEventListener: (_type: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) =>
      listeners.delete(listener),
  }
  const view = {
    matchMedia: () => {
      queries++
      return query
    },
  } as unknown as Window
  return {
    view,
    setDark(next: boolean) {
      dark = next
      listeners.forEach((listener) => listener())
    },
    get queries() {
      return queries
    },
    get listeners() {
      return listeners.size
    },
  }
}

// A store like a primitive's, holding one color scheme state.
function fakeStore(initial: ColorSchemeState) {
  let state = { colorScheme: initial }
  return {
    get: () => state,
    set: (partial: { colorScheme: ColorSchemeState }) =>
      (state = { ...state, ...partial }),
  }
}

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve))

test("system follows the browser's preference, and shows it", () => {
  const page = fakeWindow(true)
  const colorScheme = createColorScheme({ view: page.view })
  expect(colorScheme.get()).toEqual({
    value: "system",
    system: "dark",
    resolved: "dark",
  })
  page.setDark(false)
  expect(colorScheme.get()).toEqual({
    value: "system",
    system: "light",
    resolved: "light",
  })
})

test("a chosen scheme shows whatever the browser prefers", () => {
  const page = fakeWindow(true)
  const colorScheme = createColorScheme({
    view: page.view,
    defaultValue: "light",
  })
  expect(colorScheme.get()).toEqual({
    value: "light",
    system: "dark",
    resolved: "light",
  })
})

test("get returns the same object until something changes", () => {
  const page = fakeWindow()
  const colorScheme = createColorScheme({ view: page.view })
  const first = colorScheme.get()
  expect(colorScheme.get()).toBe(first)
  page.setDark(true)
  expect(colorScheme.get()).not.toBe(first)
})

test("set changes the scheme through onValueChange, with its reason", () => {
  const page = fakeWindow(true)
  const changes: [ColorSchemeValue, string, string][] = []
  const colorScheme = createColorScheme({
    view: page.view,
    onValueChange: (value, details) =>
      changes.push([value, details.reason, details.source]),
  })
  const heard: ColorSchemeState[] = []
  cleanups.push(colorScheme.subscribe((state) => heard.push(state)))
  expect(colorScheme.set("light")).toBe(true)
  expect(colorScheme.set("light")).toBe(false)
  expect(colorScheme.set("system", { reason: "item-press" })).toBe(true)
  expect(changes).toEqual([
    ["light", "imperative", "programmatic"],
    ["system", "item-press", "programmatic"],
  ])
  expect(heard.map((state) => state.resolved)).toEqual(["light", "dark"])
})

test("a canceled change keeps the scheme", () => {
  const colorScheme = createColorScheme({
    onValueChange: (_value, details) => details.cancel(),
  })
  expect(colorScheme.set("dark")).toBe(false)
  expect(colorScheme.get().value).toBe("system")
})

test("onSystemValueChange hears the browser while something subscribes", () => {
  const page = fakeWindow()
  const heard: string[] = []
  const colorScheme = createColorScheme({
    view: page.view,
    onSystemValueChange: (value) => heard.push(value),
  })
  page.setDark(true)
  const stop = colorScheme.subscribe(() => {})
  page.setDark(false)
  page.setDark(true)
  stop()
  page.setDark(false)
  expect(heard).toEqual(["light", "dark"])
})

test("color schemes on one window share one query and one change listener", () => {
  const page = fakeWindow()
  const first = createColorScheme({ view: page.view })
  const second = createColorScheme({ view: page.view, defaultValue: "dark" })
  const stops = [
    first.subscribe(() => {}),
    first.subscribe(() => {}),
    second.subscribe(() => {}),
  ]
  expect(page.queries).toBe(1)
  expect(page.listeners).toBe(1)
  stops.forEach((stop) => stop())
  expect(page.listeners).toBe(0)
})

test("the same listener subscribed twice stops once per call", () => {
  const page = fakeWindow()
  const colorScheme = createColorScheme({ view: page.view })
  const heard: string[] = []
  const listener = (state: ColorSchemeState) => heard.push(state.system)
  const stopFirst = colorScheme.subscribe(listener)
  colorScheme.subscribe(listener)
  stopFirst()
  stopFirst()
  page.setDark(true)
  expect(heard).toEqual(["dark"])
})

test("a browser without prefers-color-scheme keeps the initial preference, with no listener", () => {
  const page = fakeWindow(true, { supported: false })
  const colorScheme = createColorScheme({ view: page.view })
  cleanups.push(colorScheme.subscribe(() => {}))
  expect(colorScheme.get()).toEqual({
    value: "system",
    system: "unknown",
    resolved: "unknown",
  })
  expect(page.listeners).toBe(0)
})

test("reads its initial preference without a matchMedia, as jsdom has none", () => {
  const colorScheme = createColorScheme({ initial: "dark" })
  expect(colorScheme.get()).toEqual({
    value: "system",
    system: "dark",
    resolved: "dark",
  })
  expect(colorScheme.subscribe(() => {})).toBeTypeOf("function")
})

test("follow keeps the initial state until a microtask after it starts", async () => {
  const page = fakeWindow(true)
  const colorScheme = createColorScheme({ view: page.view })
  const store = fakeStore(colorScheme.initialState)
  cleanups.push(colorScheme.follow(store, "colorScheme"))
  expect(store.get().colorScheme).toEqual({
    value: "system",
    system: "unknown",
    resolved: "unknown",
  })
  await tick()
  expect(store.get().colorScheme.resolved).toBe("dark")
  page.setDark(false)
  expect(store.get().colorScheme.resolved).toBe("light")
  colorScheme.set("dark")
  expect(store.get().colorScheme).toEqual({
    value: "dark",
    system: "light",
    resolved: "dark",
  })
})

test("follow stopped before its microtask never subscribes", async () => {
  const page = fakeWindow(true)
  const colorScheme = createColorScheme({ view: page.view })
  const store = fakeStore(colorScheme.initialState)
  colorScheme.follow(store, "colorScheme")()
  await tick()
  expect(store.get().colorScheme.system).toBe("unknown")
  expect(page.listeners).toBe(0)
})

test("primitives render the preseeded state, then follow the color scheme once a part binds", async () => {
  const page = fakeWindow(false)
  const colorScheme = createColorScheme({ view: page.view, initial: "dark" })
  const themed = definePrimitive({
    name: "themed",
    state: () => ({ colorScheme: colorScheme.initialState }),
    api: () => ({}),
    slots: (slot) => ({
      root: slot({
        attrs: (state) => ({ "data-color-scheme": state.colorScheme.value }),
        bind: (_el, part) => colorScheme.follow(part.store, "colorScheme"),
      }),
    }),
  })
  const instances = [themed({ id: "a" }), themed({ id: "b" })]
  for (const instance of instances) {
    cleanups.push(
      bind(instance.part("root"), document.createElement("div")),
      () => instance.destroy()
    )
  }
  const resolved = () =>
    instances.map((instance) => instance.get().colorScheme.resolved)
  expect(resolved()).toEqual(["dark", "dark"])
  await tick()
  expect(resolved()).toEqual(["light", "light"])
  colorScheme.set("dark", { reason: "item-press" })
  expect(resolved()).toEqual(["dark", "dark"])
  expect(page.listeners).toBe(1)
})

test("reads a saved choice back once something subscribes, with the reason restore", () => {
  localStorage.setItem("color-scheme-restore", "dark")
  cleanups.push(() => localStorage.clear())
  const reasons: string[] = []
  const colorScheme = createColorScheme({
    storage: createLocalStorage("color-scheme-restore"),
    onValueChange: (_value, details) => reasons.push(details.reason),
  })
  expect(colorScheme.initialState.value).toBe("system")
  // A render in the browser only reads it right away, and hydration starts from initialState.
  const before = colorScheme.get()
  expect(before.value).toBe("dark")
  cleanups.push(colorScheme.subscribe(() => {}))
  expect(colorScheme.get()).toBe(before)
  expect(reasons).toEqual(["restore"])
})

test("saves each choice, and hears another storage with the same ID", () => {
  cleanups.push(() => localStorage.clear())
  const reasons: string[] = []
  const colorScheme = createColorScheme({
    storage: createLocalStorage("color-scheme-save"),
    onValueChange: (_value, details) => reasons.push(details.reason),
  })
  cleanups.push(colorScheme.subscribe(() => {}))
  colorScheme.set("light", { reason: "item-press" })
  expect(localStorage.getItem("color-scheme-save")).toBe("light")
  createLocalStorage("color-scheme-save").set("dark")
  expect(colorScheme.get().value).toBe("dark")
  createLocalStorage("color-scheme-save").set("not a scheme")
  expect(colorScheme.get().value).toBe("system")
  expect(reasons).toEqual(["item-press", "storage-sync", "storage-sync"])
})

test("ignores a saved value that isn't a scheme", () => {
  localStorage.setItem("color-scheme-bad", "sepia")
  cleanups.push(() => localStorage.clear())
  const colorScheme = createColorScheme({
    storage: createLocalStorage("color-scheme-bad"),
  })
  cleanups.push(colorScheme.subscribe(() => {}))
  expect(colorScheme.get().value).toBe("system")
})

test("a cookie starts the choice right away, since the server reads it too", () => {
  document.cookie = "color-scheme-cookie=light; path=/"
  cleanups.push(
    () => (document.cookie = "color-scheme-cookie=; path=/; max-age=0")
  )
  const colorScheme = createColorScheme({
    storage: createCookieStorage("color-scheme-cookie"),
  })
  expect(colorScheme.initialState.value).toBe("light")
})

test("a choice removed while nothing subscribes goes back to the default on the next subscribe", () => {
  cleanups.push(() => localStorage.clear())
  const reasons: string[] = []
  const colorScheme = createColorScheme({
    storage: createLocalStorage("color-scheme-removed"),
    onValueChange: (_value, details) => reasons.push(details.reason),
  })
  const stop = colorScheme.subscribe(() => {})
  colorScheme.set("dark", { reason: "item-press" })
  stop()
  localStorage.removeItem("color-scheme-removed")
  cleanups.push(colorScheme.subscribe(() => {}))
  expect(colorScheme.get().value).toBe("system")
  expect(reasons).toEqual(["item-press", "restore"])
})

test("a choice saved elsewhere while nothing subscribes comes back on the next subscribe", () => {
  cleanups.push(() => localStorage.clear())
  const colorScheme = createColorScheme({
    storage: createLocalStorage("color-scheme-elsewhere"),
  })
  const stop = colorScheme.subscribe(() => {})
  colorScheme.set("dark")
  stop()
  localStorage.setItem("color-scheme-elsewhere", "light")
  cleanups.push(colorScheme.subscribe(() => {}))
  expect(colorScheme.get().value).toBe("light")
})

test("a choice that couldn't be saved survives subscribing again", () => {
  const storage = createLocalStorage("color-scheme-unsaved")
  const colorScheme = createColorScheme({
    storage: { ...storage, set: () => false },
  })
  const stop = colorScheme.subscribe(() => {})
  colorScheme.set("dark")
  stop()
  cleanups.push(colorScheme.subscribe(() => {}))
  expect(colorScheme.get().value).toBe("dark")
})
