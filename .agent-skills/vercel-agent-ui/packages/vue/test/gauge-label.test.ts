// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { createApp, h, nextTick, shallowRef, type App } from "vue"
import { Meter, MeterLabel, Progress, ProgressLabel } from "../src"

const apps: App[] = []
afterEach(() => apps.splice(0).forEach((app) => app.unmount()))

const settled = () => new Promise((resolve) => setTimeout(resolve))

test.each([
  ["progress", Progress, ProgressLabel],
  ["meter", Meter, MeterLabel],
] as const)(
  "a %s label shown after mount names the root",
  async (_, Root, Label) => {
    const shown = shallowRef(false)
    const el = document.createElement("div")
    document.body.append(el)
    const app = createApp(() =>
      h(Root, { value: 40, "aria-label": "Storage" }, () =>
        shown.value ? h(Label, () => "Storage") : null
      )
    )
    apps.push(app)
    app.mount(el)
    await settled()
    const root = el.firstElementChild!
    expect(root.hasAttribute("aria-labelledby")).toBe(false)
    shown.value = true
    await nextTick()
    await settled()
    expect(root.getAttribute("aria-labelledby")).toBe(
      el.querySelector('[data-slot$="-label"]')!.id
    )
  }
)
