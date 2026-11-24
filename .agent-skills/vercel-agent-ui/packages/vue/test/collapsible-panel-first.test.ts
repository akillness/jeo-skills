// @vitest-environment jsdom
import { renderToString } from "@vue/server-renderer"
import { afterEach, expect, test } from "vitest"
import { createApp, createSSRApp, h, type App } from "vue"
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../src"

Element.prototype.getAnimations ??= () => []

const apps: App[] = []
afterEach(() => apps.splice(0).forEach((app) => app.unmount()))

const settled = () => new Promise((resolve) => setTimeout(resolve))

const view = () =>
  h(Collapsible, null, () => [
    h(CollapsiblePanel, { keepMounted: true }, () => "Panel"),
    h(CollapsibleTrigger, null, () => "Details"),
  ])

test.each(["mounted", "hydrated"])(
  "a trigger after a kept panel controls it once %s",
  async (how) => {
    const el = document.createElement("div")
    document.body.append(el)
    if (how === "hydrated") {
      el.innerHTML = await renderToString(createSSRApp(view))
    }
    const app = how === "hydrated" ? createSSRApp(view) : createApp(view)
    apps.push(app)
    app.mount(el)
    await settled()
    expect(el.querySelector("button")!.getAttribute("aria-controls")).toBe(
      el.querySelector('[data-slot="collapsible-panel"]')!.id
    )
  }
)
