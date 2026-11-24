// A name or typing hint passed to a part replaces the part's own,
// and the attributes its behavior reads stay the part's.
import { renderToString } from "@solidjs/web"
import { expect, test } from "vitest"
import { Calendar, CalendarNext, CalendarPrevious } from "../src/calendar"
import { Combobox, ComboboxInput, ComboboxLabel } from "../src/combobox"
import { Field, FieldLabel } from "../src/field"

function attribute(html: string, opening: string, name: string) {
  const tag = html.match(new RegExp(`${opening}[^>]*>`))?.[0] ?? ""
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
}

test("a calendar's Previous takes the label passed to it, and Next keeps its own", () => {
  const html = renderToString(() => (
    <Calendar defaultMonth="2026-10">
      <CalendarPrevious aria-label="Mois précédent" />
      <CalendarNext data-slot="next" />
    </Calendar>
  ))
  expect(
    attribute(html, '<button[^>]*data-slot="calendar-previous"', "aria-label")
  ).toBe("Mois précédent")
  expect(
    attribute(html, '<button[^>]*data-slot="calendar-next"', "aria-label")
  ).toBe("Next month")
})

test("a combobox input takes the autocomplete and label passed to it, and keeps its role", () => {
  const html = renderToString(() => (
    <Combobox>
      <ComboboxLabel>Email</ComboboxLabel>
      <ComboboxInput
        autocomplete="email"
        aria-label="Work email"
        role="textbox"
      />
    </Combobox>
  ))
  expect(attribute(html, "<input", "autocomplete")).toBe("email")
  expect(attribute(html, "<input", "aria-label")).toBe("Work email")
  expect(attribute(html, "<input", "role")).toBe("combobox")
})

test("a combobox input inside a labelled field keeps the label reference passed to it", () => {
  const html = renderToString(() => (
    <Field>
      <FieldLabel>Fruit</FieldLabel>
      <Combobox>
        <ComboboxLabel>Pick one</ComboboxLabel>
        <ComboboxInput aria-labelledby="mine" />
      </Combobox>
    </Field>
  ))
  expect(attribute(html, "<input", "aria-labelledby")).toBe("mine")
})
