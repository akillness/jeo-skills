// In server HTML, the parts rendered after a part given an id point at that id.
import { render } from "svelte/server"
import { expect, test } from "vitest"
import App from "./apps/author-ids-ssr-app.svelte"

const markup = (view: string) => render(App, { props: { view } }).body

// The value of `name` on the first element whose opening tag starts with `opening`.
function attribute(html: string, opening: string, name: string) {
  const tag = html.match(new RegExp(`${opening}[^>]*>`))?.[0] ?? ""
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
}

test("a panel is labelled by the id passed to its tab", () => {
  const html = markup("tabs")
  expect(attribute(html, '<[^>]*role="tab"', "id")).toBe("account")
  expect(attribute(html, '<[^>]*role="tabpanel"', "aria-labelledby")).toBe(
    "account"
  )
})

test("a dialog's trigger keeps the id passed to it, and the dialog's references still resolve", () => {
  const html = markup("dialog")
  const content = attribute(html, '<[^>]*role="dialog"', "id")
  expect(attribute(html, '<[^>]*aria-controls="', "id")).toBe("mine")
  expect(attribute(html, '<[^>]*id="mine"', "aria-controls")).toBe(content)
  expect(attribute(html, "<h2", "id")).toBe(
    attribute(html, '<[^>]*role="dialog"', "aria-labelledby")
  )
})

test("a popover's content is labelled by the id passed to its trigger", () => {
  expect(
    attribute(markup("popover"), '<[^>]*role="dialog"', "aria-labelledby")
  ).toBe("mine")
})

test("a control is labelled by the id passed to its label", () => {
  expect(attribute(markup("label"), "<input", "aria-labelledby")).toBe(
    "email-label"
  )
})

test("a control is described by the id passed to a description before it", () => {
  expect(attribute(markup("description"), "<input", "aria-describedby")).toBe(
    "email-hint"
  )
})

test("a label after its control points at the id passed to the control", () => {
  expect(attribute(markup("control"), "<label", "for")).toBe("email")
})
