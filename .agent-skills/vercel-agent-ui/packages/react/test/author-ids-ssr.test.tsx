// @vitest-environment node
// In server HTML, the parts rendered after a part given an id point at that id.
import { renderToString } from "react-dom/server"
import { expect, test } from "vitest"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "../src/dialog"
import { Field, FieldControl, FieldDescription, FieldLabel } from "../src/field"
import { Popover, PopoverContent, PopoverTrigger } from "../src/popover"
import { Tabs, TabsList, TabsPanel, TabsTab } from "../src/tabs"

// The value of `name` on the first element whose opening tag starts with `opening`.
function attribute(html: string, opening: string, name: string) {
  const tag = html.match(new RegExp(`${opening}[^>]*>`))?.[0] ?? ""
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
}

test("a panel is labelled by the id passed to its tab", () => {
  const html = renderToString(
    <Tabs defaultValue="a">
      <TabsList aria-label="Settings">
        <TabsTab value="a" id="account">
          Account
        </TabsTab>
      </TabsList>
      <TabsPanel value="a">A</TabsPanel>
    </Tabs>
  )
  expect(attribute(html, '<[^>]*role="tab"', "id")).toBe("account")
  expect(attribute(html, '<[^>]*role="tabpanel"', "aria-labelledby")).toBe(
    "account"
  )
})

test("a panel is labelled by the id on the element its tab renders", () => {
  const html = renderToString(
    <Tabs defaultValue="a">
      <TabsList aria-label="Settings">
        <TabsTab value="a" render={<button id="account" />}>
          Account
        </TabsTab>
      </TabsList>
      <TabsPanel value="a">A</TabsPanel>
    </Tabs>
  )
  expect(attribute(html, '<[^>]*role="tab"', "id")).toBe("account")
  expect(attribute(html, '<[^>]*role="tabpanel"', "aria-labelledby")).toBe(
    "account"
  )
})

test("an id on the element a tab renders wins over the one passed to the tab, as on the page", () => {
  const html = renderToString(
    <Tabs defaultValue="a">
      <TabsList aria-label="Settings">
        <TabsTab value="a" id="tab" render={<button id="account" />}>
          Account
        </TabsTab>
      </TabsList>
      <TabsPanel value="a">A</TabsPanel>
    </Tabs>
  )
  expect(attribute(html, '<[^>]*role="tab"', "id")).toBe("account")
  expect(attribute(html, '<[^>]*role="tabpanel"', "aria-labelledby")).toBe(
    "account"
  )
})

test("a dialog's trigger keeps the id passed to it, and the dialog's references still resolve", () => {
  const html = renderToString(
    <Dialog defaultOpen modal={false}>
      <DialogTrigger id="mine">Edit</DialogTrigger>
      <DialogContent>
        <DialogTitle>Profile</DialogTitle>
      </DialogContent>
    </Dialog>
  )
  const content = attribute(html, '<[^>]*role="dialog"', "id")
  expect(attribute(html, '<[^>]*aria-controls="', "id")).toBe("mine")
  expect(attribute(html, '<[^>]*id="mine"', "aria-controls")).toBe(content)
  expect(attribute(html, "<h2", "id")).toBe(
    attribute(html, '<[^>]*role="dialog"', "aria-labelledby")
  )
})

test("a popover's content is labelled by the id passed to its trigger", () => {
  const html = renderToString(
    <Popover defaultOpen>
      <PopoverTrigger id="mine">Open</PopoverTrigger>
      <PopoverContent>Body</PopoverContent>
    </Popover>
  )
  expect(attribute(html, '<[^>]*role="dialog"', "aria-labelledby")).toBe("mine")
})

test("a control is labelled by the id passed to its label", () => {
  const html = renderToString(
    <Field>
      <FieldLabel id="email-label">Email</FieldLabel>
      <FieldControl />
    </Field>
  )
  expect(attribute(html, "<input", "aria-labelledby")).toBe("email-label")
})

test("a control is described by the id passed to a description before it", () => {
  const html = renderToString(
    <Field>
      <FieldLabel>Email</FieldLabel>
      <FieldDescription id="email-hint">Work address.</FieldDescription>
      <FieldControl />
    </Field>
  )
  expect(attribute(html, "<input", "aria-describedby")).toBe("email-hint")
})

test("a label after its control points at the id passed to the control", () => {
  const html = renderToString(
    <Field>
      <FieldControl id="email" type="checkbox" />
      <FieldLabel>Email me</FieldLabel>
    </Field>
  )
  expect(attribute(html, "<label", "for")).toBe("email")
})
