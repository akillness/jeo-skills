// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { createPreference } from "@ui-sdk/core"
import { createApp, h, type App } from "vue"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "../src/dialog"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../src/menu"
import { Preferences } from "../src/preferences"
import { Tooltip, TooltipContent, TooltipTrigger } from "../src/tooltip"

Element.prototype.getAnimations ??= () => []

let app: App | undefined
afterEach(() => {
  vi.restoreAllMocks()
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

test.each([
  [
    "Dialog",
    () =>
      h(Dialog, { class: "root", "data-x": "1" }, () => [
        h(DialogTrigger, () => "Open"),
        h(DialogContent, () => h(DialogTitle, () => "Title")),
      ]),
  ],
  [
    "Menu",
    () =>
      h(Menu, { class: "root", "data-x": "1" }, () => [
        h(MenuTrigger, () => "Open"),
        h(MenuContent, () => h(MenuItem, () => "Item")),
      ]),
  ],
  [
    "Tooltip",
    () =>
      h(Tooltip, { class: "root", "data-x": "1" }, () => [
        h(TooltipTrigger, () => "Hover"),
        h(TooltipContent, () => "Tip"),
      ]),
  ],
])(
  "a %s root drops its attributes with one warning that names it",
  (name, render) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const host = mount(render)

    const messages = warn.mock.calls.map(([message]) => String(message))
    expect(
      messages.filter((message) => message.startsWith("[Vue warn]"))
    ).toEqual([])
    expect(messages).toEqual([
      `[ui-sdk] ${name} renders no element, so it ignores class, data-x. Put them on one of its parts.`,
    ])
    expect(host.querySelector(".root, [data-x]")).toBeNull()
  }
)

function mount(render: () => unknown) {
  const host = document.createElement("div")
  document.body.append(host)
  app = createApp({ render })
  app.mount(host)
  return host
}

test("many roots with the same attributes warn once", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  mount(() =>
    Array.from({ length: 3 }, () =>
      h(Tooltip, { "data-many": "1" }, () => [
        h(TooltipTrigger, () => "Hover"),
        h(TooltipContent, () => "Tip"),
      ])
    )
  )
  expect(
    warn.mock.calls.filter(([message]) => String(message).includes("data-many"))
  ).toHaveLength(1)
})

test("Preferences, which renders an element, keeps its attributes", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const theme = createPreference({
    values: ["light", "dark"],
    defaultValue: "light",
    attribute: "data-theme",
  })
  const host = mount(() =>
    h(Preferences, { preferences: [theme], class: "shell" }, () => "App")
  )
  expect(
    host.querySelector('[data-slot="preferences"]')?.classList.contains("shell")
  ).toBe(true)
  expect(warn).not.toHaveBeenCalled()
})
