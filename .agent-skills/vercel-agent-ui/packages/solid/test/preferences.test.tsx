// A client-only render of Preferences: it drops the script, puts the saved
// values on their attributes, and follows every change after.
import {
  createColorScheme,
  createLocalStorage,
  createPreference,
} from "@ui-sdk/core"
import { render } from "@solidjs/web"
import { flush } from "solid-js"
import { afterEach, expect, test } from "vitest"
import { Preferences, usePreference } from "../src/preferences"

let dispose: (() => void) | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
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
  function Label() {
    const state = usePreference(skinTone)
    return <p>{`Tone: ${state().value}`}</p>
  }
  const container = document.body.appendChild(document.createElement("div"))
  dispose = render(
    () => (
      <Preferences preferences={[colorScheme, skinTone]}>
        <Label />
      </Preferences>
    ),
    container
  )
  flush()
  const element = container.querySelector<HTMLElement>(
    '[data-slot="preferences"]'
  )!
  expect(container.querySelector("script")).toBeNull()
  expect(element.style.display).toBe("contents")
  expect(document.documentElement.dataset.colorScheme).toBe("dark")
  expect(element.dataset.skinTone).toBe("medium")
  expect(container.querySelector("p")!.textContent).toBe("Tone: medium")
  skinTone.set("dark", { reason: "item-press" })
  colorScheme.set("light")
  flush()
  expect(element.dataset.skinTone).toBe("dark")
  expect(document.documentElement.dataset.colorScheme).toBe("light")
  expect(container.querySelector("p")!.textContent).toBe("Tone: dark")
})
