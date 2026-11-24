// A name or typing hint passed to a part replaces the part's own,
// and the attributes its behavior reads stay the part's.
import { render } from "svelte/server"
import { expect, test } from "vitest"
import App from "./apps/author-attributes-ssr-app.svelte"

const markup = (view: string) => render(App, { props: { view } }).body

function attribute(html: string, opening: string, name: string) {
  const tag = html.match(new RegExp(`${opening}[^>]*>`))?.[0] ?? ""
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
}

test("a calendar's Previous takes the label passed to it, and Next keeps its own", () => {
  const html = markup("calendar")
  expect(
    attribute(html, '<button[^>]*data-slot="calendar-previous"', "aria-label")
  ).toBe("Mois précédent")
  expect(
    attribute(html, '<button[^>]*data-slot="calendar-next"', "aria-label")
  ).toBe("Next month")
})

test("a combobox input takes the autocomplete and label passed to it, and keeps its role", () => {
  const html = markup("combobox")
  expect(attribute(html, "<input", "autocomplete")).toBe("email")
  expect(attribute(html, "<input", "aria-label")).toBe("Work email")
  expect(attribute(html, "<input", "role")).toBe("combobox")
})

test("a combobox input inside a labelled field keeps the label reference passed to it", () => {
  expect(attribute(markup("field"), "<input", "aria-labelledby")).toBe("mine")
})
