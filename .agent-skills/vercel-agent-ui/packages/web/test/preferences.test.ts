// @vitest-environment jsdom
// <ui-preferences> on a static page: its script, first inside it, runs as
// the page loads, before the element is defined, then the element follows.
import {
  createColorScheme,
  createLocalStorage,
  createPreference,
  preferencesScript,
} from "@ui-sdk/core"
import { afterEach, expect, test } from "vitest"
import { definePreferencesElements } from "../src/preferences"

definePreferencesElements()

afterEach(() => {
  document.body.replaceChildren()
  localStorage.clear()
  delete (window as Window & { __uiSdkStorage?: unknown }).__uiSdkStorage
  for (const name of document.documentElement.getAttributeNames()) {
    if (name.startsWith("data-")) {
      document.documentElement.removeAttribute(name)
    }
  }
})

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve))

function setup() {
  const colorScheme = createColorScheme({
    storage: createLocalStorage("color-scheme"),
    global: true,
  })
  const skinTone = createPreference({
    values: ["default", "light", "medium", "dark"],
    defaultValue: "default",
    attribute: "data-skin-tone",
    storage: createLocalStorage("skin-tone"),
  })
  return { colorScheme, skinTone, preferences: [colorScheme, skinTone] }
}

test("shows the saved values from its script, then follows them once given its preferences", async () => {
  localStorage.setItem("color-scheme", "dark")
  localStorage.setItem("skin-tone", "medium")
  const { preferences, skinTone, colorScheme } = setup()
  // The page as served: the script runs as the parser reaches it.
  const template = document.createElement("template")
  template.innerHTML = `<ui-preferences><script></script><p>App</p></ui-preferences>`
  const element = template.content.firstElementChild as HTMLElement & {
    preferences: typeof preferences
  }
  const script = element.querySelector("script")!
  script.textContent = preferencesScript(preferences)
  Object.defineProperty(document, "currentScript", {
    configurable: true,
    value: script,
  })
  new Function(script.textContent)()
  Object.defineProperty(document, "currentScript", {
    configurable: true,
    value: null,
  })
  expect(document.documentElement.dataset.colorScheme).toBe("dark")
  expect(element.dataset.skinTone).toBe("medium")

  document.body.append(element)
  element.preferences = preferences
  expect(element.style.display).toBe("contents")
  expect(document.documentElement.dataset.colorScheme).toBe("dark")
  expect(element.dataset.skinTone).toBe("medium")

  skinTone.set("dark", { reason: "item-press" })
  colorScheme.set("light")
  expect(element.dataset.skinTone).toBe("dark")
  expect(document.documentElement.dataset.colorScheme).toBe("light")

  // Removed, it stops following.
  element.remove()
  await tick()
  skinTone.set("light")
  expect(element.dataset.skinTone).toBe("dark")
})

test("moved in one go, it keeps following", async () => {
  const { preferences, skinTone } = setup()
  const element = document.createElement("ui-preferences") as HTMLElement & {
    preferences: typeof preferences
  }
  element.preferences = preferences
  document.body.append(element)
  const other = document.body.appendChild(document.createElement("section"))
  other.append(element)
  await tick()
  skinTone.set("medium")
  expect(element.dataset.skinTone).toBe("medium")
})

test("preferences assigned before the element upgraded still take effect", () => {
  const { preferences, skinTone } = setup()
  // A document with no definitions, so the element stays un-upgraded, like one parsed before its script ran.
  const other = document.implementation.createHTMLDocument()
  const element = other.createElement("ui-preferences") as HTMLElement & {
    preferences: typeof preferences
  }
  element.preferences = preferences
  expect(Object.prototype.hasOwnProperty.call(element, "preferences")).toBe(
    true
  )
  document.body.append(document.adoptNode(element))
  expect(Object.prototype.hasOwnProperty.call(element, "preferences")).toBe(
    false
  )
  expect(element.preferences).toBe(preferences)
  skinTone.set("medium")
  expect(element.dataset.skinTone).toBe("medium")
})
