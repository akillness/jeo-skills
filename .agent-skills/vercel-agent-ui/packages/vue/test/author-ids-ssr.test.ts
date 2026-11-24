// @vitest-environment node
// In server HTML, the parts rendered after a part given an id point at that id.
import { renderToString } from "@vue/server-renderer"
import { expect, test } from "vitest"
import { createSSRApp, h, type VNodeChild } from "vue"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "../src/dialog"
import { Field, FieldControl, FieldDescription, FieldLabel } from "../src/field"
import { Popover, PopoverContent, PopoverTrigger } from "../src/popover"
import { Tabs, TabsList, TabsPanel, TabsTab } from "../src/tabs"

const render = (view: () => VNodeChild) =>
  renderToString(createSSRApp(() => view()))

// The value of `name` on the first element whose opening tag starts with `opening`.
function attribute(html: string, opening: string, name: string) {
  const tag = html.match(new RegExp(`${opening}[^>]*>`))?.[0] ?? ""
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
}

test("a panel is labelled by the id passed to its tab", async () => {
  const html = await render(() =>
    h(Tabs, { defaultValue: "a" }, () => [
      h(TabsList, { "aria-label": "Settings" }, () =>
        h(TabsTab, { value: "a", id: "account" }, () => "Account")
      ),
      h(TabsPanel, { value: "a" }, () => "A"),
    ])
  )
  expect(attribute(html, '<[^>]*role="tab"', "id")).toBe("account")
  expect(attribute(html, '<[^>]*role="tabpanel"', "aria-labelledby")).toBe(
    "account"
  )
})

test("a dialog's trigger keeps the id passed to it, and the dialog's references still resolve", async () => {
  const html = await render(() =>
    h(Dialog, { defaultOpen: true, modal: false }, () => [
      h(DialogTrigger, { id: "mine" }, () => "Edit"),
      h(DialogContent, null, () => h(DialogTitle, null, () => "Profile")),
    ])
  )
  const content = attribute(html, '<[^>]*role="dialog"', "id")
  expect(attribute(html, '<[^>]*aria-controls="', "id")).toBe("mine")
  expect(attribute(html, '<[^>]*id="mine"', "aria-controls")).toBe(content)
  expect(attribute(html, "<h2", "id")).toBe(
    attribute(html, '<[^>]*role="dialog"', "aria-labelledby")
  )
})

test("a popover's content is labelled by the id passed to its trigger", async () => {
  const html = await render(() =>
    h(Popover, { defaultOpen: true }, () => [
      h(PopoverTrigger, { id: "mine" }, () => "Open"),
      h(PopoverContent, null, () => "Body"),
    ])
  )
  expect(attribute(html, '<[^>]*role="dialog"', "aria-labelledby")).toBe("mine")
})

test("a control is labelled by the id passed to its label", async () => {
  const html = await render(() =>
    h(Field, null, () => [
      h(FieldLabel, { id: "email-label" }, () => "Email"),
      h(FieldControl),
    ])
  )
  expect(attribute(html, "<input", "aria-labelledby")).toBe("email-label")
})

test("a control is described by the id passed to a description before it", async () => {
  const html = await render(() =>
    h(Field, null, () => [
      h(FieldLabel, null, () => "Email"),
      h(FieldDescription, { id: "email-hint" }, () => "Work address."),
      h(FieldControl),
    ])
  )
  expect(attribute(html, "<input", "aria-describedby")).toBe("email-hint")
})

test("a label after its control points at the id passed to the control", async () => {
  const html = await render(() =>
    h(Field, null, () => [
      h(FieldControl, { id: "email", type: "checkbox" }),
      h(FieldLabel, null, () => "Email me"),
    ])
  )
  expect(attribute(html, "<label", "for")).toBe("email")
})
