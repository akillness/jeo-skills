// @vitest-environment jsdom
// Parts that bind while Vue hydrates set the flags other parts' attributes
// read, like whether a label or a description is in the page. A part that
// hydrates after the flag is set keeps the server's attributes, so the kernel
// sets a flag a later part reads, like a select's label, a microtask later,
// and one only the part's ancestors read, like a popup's title, at once
// (`flagWhileBound`).
import { renderToString } from "@vue/server-renderer"
import { afterEach, expect, test } from "vitest"
import { createSSRApp, h, type VNodeChild } from "vue"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../src/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "../src/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../src/select"

HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

afterEach(() => document.body.replaceChildren())

async function hydrate(view: () => VNodeChild) {
  const container = document.createElement("div")
  container.innerHTML = await renderToString(createSSRApp(() => view()))
  document.body.append(container)
  createSSRApp(() => view()).mount(container)
  await new Promise((done) => setTimeout(done))
}

test("a select's label names its trigger once hydrated", async () => {
  await hydrate(() =>
    h(Select, { items: [{ value: "pro", label: "Pro" }] }, () => [
      h(SelectLabel, null, () => "Plan"),
      h(SelectTrigger),
    ])
  )
  const label = document.querySelector('[data-slot="select-label"]')!
  expect(
    document.querySelector('[role="combobox"]')!.getAttribute("aria-labelledby")
  ).toContain(label.id)
})

test("an open select's list takes its trigger's name once hydrated", async () => {
  await hydrate(() =>
    h(Select, { defaultOpen: true, defaultValue: "pro" }, () => [
      h(SelectTrigger, { "aria-label": "Plan" }, () => h(SelectValue)),
      h(SelectContent, null, () =>
        h(SelectItem, { value: "pro", label: "Pro" })
      ),
    ])
  )
  const list = document.querySelector('[role="listbox"]')!
  expect([
    list.getAttribute("aria-label"),
    list.getAttribute("aria-labelledby"),
  ]).toEqual(["Plan", null])
})

test("an open dialog's description describes it once hydrated", async () => {
  await hydrate(() =>
    h(Dialog, { defaultOpen: true }, () => [
      h(DialogTrigger, null, () => "Edit"),
      h(DialogContent, null, () => [
        h(DialogTitle, null, () => "Profile"),
        h(DialogDescription, null, () => "Who you are."),
      ]),
    ])
  )
  const description = document.querySelector(
    '[data-slot="dialog-description"]'
  )!
  expect(
    document.querySelector('[role="dialog"]')!.getAttribute("aria-describedby")
  ).toBe(description.id)
})

test("an open popover's title labels it once hydrated", async () => {
  await hydrate(() =>
    h(Popover, { defaultOpen: true }, () => [
      h(PopoverTrigger, null, () => "More"),
      h(PopoverContent, null, () => [h(PopoverTitle, null, () => "Details")]),
    ])
  )
  const title = document.querySelector('[data-slot="popover-title"]')!
  expect(
    document
      .querySelector('[data-slot="popover-content"]')!
      .getAttribute("aria-labelledby")
  ).toBe(title.id)
})
