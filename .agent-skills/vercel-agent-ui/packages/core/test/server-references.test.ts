// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { collapsible } from "../src/components/collapsible/collapsible"
import { meter } from "../src/components/meter/meter"
import { progress } from "../src/components/progress/progress"
import { timeline } from "../src/components/timeline/timeline"
import { checkServer, mount } from "../src/testing"

const mounts: { unmount: () => void }[] = []
afterEach(() => mounts.splice(0).forEach((mounted) => mounted.unmount()))

const serverElement = (html: string, selector: string) => {
  const template = document.createElement("template")
  template.innerHTML = html
  return template.content.querySelector(selector)!
}

const settled = () => new Promise((resolve) => setTimeout(resolve))

test("an open collapsible's trigger controls its panel in the server's HTML", () => {
  const html = checkServer(
    collapsible,
    { defaultOpen: true },
    "<root><trigger>Details</trigger><panel>Panel</panel></root>"
  )
  const panel = serverElement(html, '[data-slot="collapsible-panel"]')
  expect(serverElement(html, "button").getAttribute("aria-controls")).toBe(
    panel.id
  )
})

test("an open collapsible without a panel controls nothing once it binds", async () => {
  const view = mount(
    collapsible,
    { defaultOpen: true },
    "<root><trigger>Details</trigger></root>"
  )
  mounts.push(view)
  await settled()
  expect(view.part("trigger")!.hasAttribute("aria-controls")).toBe(false)
})

test("a collapsible opened after it binds controls its panel once the panel mounts", async () => {
  const view = mount(
    collapsible,
    {},
    "<root><trigger>Details</trigger><panel>Panel</panel></root>"
  )
  mounts.push(view)
  await settled()
  expect(view.part("trigger")!.hasAttribute("aria-controls")).toBe(false)
  await view.click(view.part("trigger")!)
  await settled()
  expect(view.part("trigger")!.getAttribute("aria-controls")).toBe(
    view.part("panel")!.id
  )
})

test.each([
  ["progress", progress, "progressbar"],
  ["meter", meter, "meter"],
] as const)(
  "a %s is named by its label in the server's HTML",
  (name, primitive, role) => {
    const html = checkServer(
      primitive,
      { value: 40 },
      "<root><label>Storage</label></root>"
    )
    const label = serverElement(html, `[data-slot="${name}-label"]`)
    expect(
      serverElement(html, `[role="${role}"]`).getAttribute("aria-labelledby")
    ).toBe(label.id)
  }
)

test.each([
  ["progress", progress],
  ["meter", meter],
] as const)(
  "a %s without a label points at none once it binds",
  async (_, primitive) => {
    const view = mount(
      primitive,
      { value: 40 },
      `<root aria-label="Storage"></root>`
    )
    mounts.push(view)
    await settled()
    expect(view.part("root")!.hasAttribute("aria-labelledby")).toBe(false)
  }
)

test("a timeline item is named by its title in the server's HTML", () => {
  const html = checkServer(
    timeline,
    {},
    `<root aria-label="Activity"><item value="a"><title value="a">Deployed</title></item></root>`
  )
  const title = serverElement(html, '[data-slot="timeline-title"]')
  expect(
    serverElement(html, '[role="listitem"]').getAttribute("aria-labelledby")
  ).toBe(title.id)
})

test("a timeline item without a title points at none once it binds", async () => {
  const view = mount(
    timeline,
    {},
    `<root aria-label="Activity"><item value="a">Deployed</item></root>`
  )
  mounts.push(view)
  await settled()
  expect(view.part("item", "a")!.hasAttribute("aria-labelledby")).toBe(false)
})
