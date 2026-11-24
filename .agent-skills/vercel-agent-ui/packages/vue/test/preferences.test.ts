// @vitest-environment jsdom
// Preferences across a page load: the server's HTML, its script run the way
// the parser would, then hydration.
import {
  createColorScheme,
  createLocalStorage,
  createPreference,
} from "@ui-sdk/core"
import { renderToString } from "@vue/server-renderer"
import { afterEach, expect, test, vi } from "vitest"
import {
  createApp,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  type App,
} from "vue"
import { Preferences, usePreference } from "../src/preferences"

let app: App | undefined

afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
  localStorage.clear()
  delete (window as Window & { __uiSdkStorage?: unknown }).__uiSdkStorage
  for (const name of document.documentElement.getAttributeNames()) {
    if (name.startsWith("data-")) {
      document.documentElement.removeAttribute(name)
    }
  }
})

const tones = ["default", "light", "medium", "dark"] as const

function setup() {
  const colorScheme = createColorScheme({
    storage: createLocalStorage("color-scheme"),
    global: true,
  })
  const skinTone = createPreference({
    values: tones,
    defaultValue: "default",
    attribute: "data-skin-tone",
    storage: createLocalStorage("skin-tone"),
  })
  const Label = defineComponent(() => {
    const state = usePreference(skinTone)
    return () => h("p", `Tone: ${state.value.value}`)
  })
  const root = () =>
    h(Preferences, { preferences: [colorScheme, skinTone] }, () => [h(Label)])
  return { colorScheme, skinTone, root }
}

// What the browser does with server HTML: insert it, and run each script as it's parsed.
function load(container: HTMLElement, html: string) {
  container.innerHTML = html
  for (const script of container.querySelectorAll("script")) {
    Object.defineProperty(document, "currentScript", {
      configurable: true,
      value: script,
    })
    new Function(script.textContent!)()
  }
  Object.defineProperty(document, "currentScript", {
    configurable: true,
    value: null,
  })
}

const settle = () => new Promise((done) => setTimeout(done))

test("the server renders one script first, and the defaults on its element", async () => {
  const html = await renderToString(createSSRApp(setup().root))
  expect(html.match(/<script/g)).toHaveLength(1)
  expect(html).toMatch(
    /^<div data-slot="preferences" data-skin-tone="default"[^>]*><script>/
  )
  expect(html).toContain("Tone: default")
})

test("saved values show before hydration, which then matches, and content catches up after", async () => {
  localStorage.setItem("color-scheme", "dark")
  localStorage.setItem("skin-tone", "medium")
  const { root, skinTone } = setup()
  const container = document.body.appendChild(document.createElement("div"))
  load(container, await renderToString(createSSRApp(root)))
  const element = container.querySelector<HTMLElement>(
    '[data-slot="preferences"]'
  )!
  expect(document.documentElement.dataset.colorScheme).toBe("dark")
  expect(element.dataset.skinTone).toBe("medium")

  const warnings = vi.spyOn(console, "warn").mockImplementation(() => {})
  const errors = vi.spyOn(console, "error").mockImplementation(() => {})
  app = createSSRApp(root)
  app.mount(container)
  await settle()
  const logged = [...warnings.mock.calls, ...errors.mock.calls]
  warnings.mockRestore()
  errors.mockRestore()
  expect(logged).toEqual([])
  expect(document.documentElement.dataset.colorScheme).toBe("dark")
  expect(element.dataset.skinTone).toBe("medium")
  expect(container.querySelector("p")!.textContent).toBe("Tone: medium")
  expect(container.querySelector("script")).toBeNull()

  skinTone.set("dark", { reason: "item-press" })
  await nextTick()
  expect(element.dataset.skinTone).toBe("dark")
  expect(container.querySelector("p")!.textContent).toBe("Tone: dark")
})

test("a client-only render drops the script, and still shows the saved values", async () => {
  localStorage.setItem("color-scheme", "light")
  const { root, colorScheme } = setup()
  const container = document.body.appendChild(document.createElement("div"))
  app = createApp(root)
  app.mount(container)
  await settle()
  expect(container.querySelector("script")).toBeNull()
  expect(document.documentElement.dataset.colorScheme).toBe("light")
  colorScheme.set("dark")
  expect(document.documentElement.dataset.colorScheme).toBe("dark")
})

test("a restore that onValueChange cancels leaves the default on the attributes the script set", async () => {
  localStorage.setItem("color-scheme", "dark")
  localStorage.setItem("skin-tone", "medium")
  const cancel = (_value: string, details: { cancel: () => void }) =>
    details.cancel()
  const colorScheme = createColorScheme({
    storage: createLocalStorage("color-scheme"),
    global: true,
    onValueChange: cancel,
  })
  const skinTone = createPreference({
    values: tones,
    defaultValue: "default",
    attribute: "data-skin-tone",
    storage: createLocalStorage("skin-tone"),
    onValueChange: cancel,
  })
  const root = () => h(Preferences, { preferences: [colorScheme, skinTone] })
  const container = document.body.appendChild(document.createElement("div"))
  load(container, await renderToString(createSSRApp(root)))
  const element = container.querySelector<HTMLElement>(
    '[data-slot="preferences"]'
  )!
  expect(element.dataset.skinTone).toBe("medium")
  app = createSSRApp(root)
  app.mount(container)
  await settle()
  expect(skinTone.get().value).toBe("default")
  expect(element.dataset.skinTone).toBe("default")
  expect(document.documentElement.dataset.colorScheme).toBe("system")
})
