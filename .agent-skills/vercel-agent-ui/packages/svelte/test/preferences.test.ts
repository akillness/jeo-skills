// A client-only render of Preferences: it drops the script, puts the saved
// values on their attributes, and follows every change after.
import {
  createColorScheme,
  createLocalStorage,
  createPreference,
} from "@ui-sdk/core"
import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import App from "./apps/preferences-app.svelte"

let app: ReturnType<typeof mount> | undefined

afterEach(() => {
  if (app) {
    unmount(app)
  }
  app = undefined
  document.body.replaceChildren()
  localStorage.clear()
  for (const name of document.documentElement.getAttributeNames()) {
    if (name.startsWith("data-")) {
      document.documentElement.removeAttribute(name)
    }
  }
})

test("puts saved values on <html> and its element, drops the script, and follows changes", () => {
  localStorage.setItem("color-scheme", "dark")
  localStorage.setItem("skin-tone", "medium")
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
  const target = document.body.appendChild(document.createElement("div"))
  app = mount(App, {
    target,
    props: { preferences: [colorScheme, skinTone], label: skinTone },
  })
  flushSync()
  const element = target.querySelector<HTMLElement>(
    '[data-slot="preferences"]'
  )!
  expect(target.querySelector("script")).toBeNull()
  expect(element.style.display).toBe("contents")
  expect(document.documentElement.dataset.colorScheme).toBe("dark")
  expect(element.dataset.skinTone).toBe("medium")
  expect(target.querySelector("p")!.textContent).toBe("Tone: medium")
  skinTone.set("dark", { reason: "item-press" })
  colorScheme.set("light")
  flushSync()
  expect(element.dataset.skinTone).toBe("dark")
  expect(document.documentElement.dataset.colorScheme).toBe("light")
  expect(target.querySelector("p")!.textContent).toBe("Tone: dark")
})
