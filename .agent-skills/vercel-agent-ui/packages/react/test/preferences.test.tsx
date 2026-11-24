// @vitest-environment jsdom
// Preferences across a page load: the server's HTML, its script run the way
// the parser would, then hydration.
import {
  createColorScheme,
  createLocalStorage,
  createPreference,
} from "@ui-sdk/core"
import * as React from "react"
import { createRoot, hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, expect, test, vi } from "vitest"
import { Preferences, usePreference } from "../src/preferences"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
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
  function Label() {
    return <p>{`Tone: ${usePreference(skinTone).value}`}</p>
  }
  const app = (
    <Preferences preferences={[colorScheme, skinTone]}>
      <Label />
    </Preferences>
  )
  return { colorScheme, skinTone, app }
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

test("the server renders one script first, and the defaults on its element", () => {
  const { app } = setup()
  const html = renderToString(app)
  expect(html.match(/<script/g)).toHaveLength(1)
  expect(html).toMatch(
    /^<div data-slot="preferences" data-skin-tone="default" style="display:contents"><script>/
  )
  expect(html).toContain("Tone: default")
})

test("saved values show before hydration, which then matches, and content catches up after", async () => {
  localStorage.setItem("color-scheme", "dark")
  localStorage.setItem("skin-tone", "medium")
  const { app, skinTone } = setup()
  const container = document.body.appendChild(document.createElement("div"))
  load(container, renderToString(app))
  const element = container.querySelector<HTMLElement>(
    '[data-slot="preferences"]'
  )!
  // The first paint.
  expect(document.documentElement.dataset.colorScheme).toBe("dark")
  expect(element.dataset.skinTone).toBe("medium")
  expect(container.querySelector("p")!.textContent).toBe("Tone: default")

  const errors = vi.spyOn(console, "error").mockImplementation(() => {})
  await React.act(async () => {
    root = hydrateRoot(container, app)
  })
  errors.mockRestore()
  expect(errors).not.toHaveBeenCalled()
  expect(document.documentElement.dataset.colorScheme).toBe("dark")
  expect(element.dataset.skinTone).toBe("medium")
  expect(container.querySelector("p")!.textContent).toBe("Tone: medium")
  // The script did its job, so it's gone after hydration.
  expect(container.querySelector("script")).toBeNull()

  await React.act(async () => skinTone.set("dark", { reason: "item-press" }))
  expect(element.dataset.skinTone).toBe("dark")
  expect(localStorage.getItem("skin-tone")).toBe("dark")
})

test("a client-only render leaves the script out, and still shows the saved values", async () => {
  localStorage.setItem("color-scheme", "light")
  const { app, colorScheme } = setup()
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () => root!.render(app))
  expect(container.querySelector("script")).toBeNull()
  expect(document.documentElement.dataset.colorScheme).toBe("light")
  await React.act(async () => colorScheme.set("dark"))
  expect(document.documentElement.dataset.colorScheme).toBe("dark")
})

test("a global value is on <html> before the first paint of a client-only render", async () => {
  localStorage.setItem("color-scheme", "dark")
  const { app } = setup()
  let painted: string | undefined
  function Page() {
    React.useLayoutEffect(() => {
      painted = document.documentElement.dataset.colorScheme
    }, [])
    return app
  }
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () => root!.render(<Page />))
  expect(painted).toBe("dark")
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
  const app = <Preferences preferences={[colorScheme, skinTone]} />
  const container = document.body.appendChild(document.createElement("div"))
  load(container, renderToString(app))
  const element = container.querySelector<HTMLElement>(
    '[data-slot="preferences"]'
  )!
  expect(element.dataset.skinTone).toBe("medium")
  await React.act(async () => {
    root = hydrateRoot(container, app)
  })
  expect(skinTone.get().value).toBe("default")
  expect(element.dataset.skinTone).toBe("default")
  expect(document.documentElement.dataset.colorScheme).toBe("system")
})
