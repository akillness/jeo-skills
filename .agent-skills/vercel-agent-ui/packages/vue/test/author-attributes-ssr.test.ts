// @vitest-environment node
// A name or typing hint passed to a part replaces the part's own,
// and the attributes its behavior reads stay the part's.
import { renderToString } from "@vue/server-renderer"
import { expect, test } from "vitest"
import { createSSRApp, h, type VNodeChild } from "vue"
import { Calendar, CalendarNext, CalendarPrevious } from "../src/calendar"
import { Combobox, ComboboxInput, ComboboxLabel } from "../src/combobox"

const render = (view: () => VNodeChild) =>
  renderToString(createSSRApp(() => view()))

function attribute(html: string, opening: string, name: string) {
  const tag = html.match(new RegExp(`${opening}[^>]*>`))?.[0] ?? ""
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
}

test("a calendar's Previous takes the label passed to it, and Next keeps its own", async () => {
  const html = await render(() =>
    h(Calendar, { defaultMonth: "2026-10" }, () => [
      h(CalendarPrevious, { "aria-label": "Mois précédent" }),
      h(CalendarNext, { "data-slot": "next" }),
    ])
  )
  expect(
    attribute(html, '<button[^>]*data-slot="calendar-previous"', "aria-label")
  ).toBe("Mois précédent")
  expect(
    attribute(html, '<button[^>]*data-slot="calendar-next"', "aria-label")
  ).toBe("Next month")
})

test("a combobox input takes the autocomplete and label passed to it, and keeps its role", async () => {
  const html = await render(() =>
    h(Combobox, null, () => [
      h(ComboboxLabel, null, () => "Email"),
      h(ComboboxInput, {
        autocomplete: "email",
        "aria-label": "Work email",
        role: "textbox",
      }),
    ])
  )
  expect(attribute(html, "<input", "autocomplete")).toBe("email")
  expect(attribute(html, "<input", "aria-label")).toBe("Work email")
  expect(attribute(html, "<input", "role")).toBe("combobox")
})
