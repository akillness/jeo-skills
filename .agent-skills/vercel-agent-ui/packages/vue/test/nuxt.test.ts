import path from "node:path"
import { beforeAll, expect, test } from "vitest"
import { listNuxtEntries } from "../../../scripts/build/nuxt-module.mjs"
import { type NuxtEntry, nuxtRegistrations } from "../nuxt/registrations"

let entries: NuxtEntry[]

beforeAll(async () => {
  entries = await listNuxtEntries(path.resolve(import.meta.dirname, ".."))
}, 30_000)

const componentOf = (name: string, prefix = "") =>
  nuxtRegistrations(entries, prefix).components.find(
    (component) => component.name === name
  )
const importsFrom = (from: string) =>
  nuxtRegistrations(entries, "").imports.find((source) => source.from === from)
    ?.imports ?? []

test("every part of an entry is registered as a component from that entry", () => {
  const dialog = entries.find(({ from }) => from === "@ui-sdk/vue/dialog")
  expect(dialog?.components).toEqual([
    "Dialog",
    "DialogBackdrop",
    "DialogClose",
    "DialogContent",
    "DialogDescription",
    "DialogShortcut",
    "DialogTitle",
    "DialogTrigger",
  ])
  expect(componentOf("DialogTrigger")).toEqual({
    name: "DialogTrigger",
    export: "DialogTrigger",
    filePath: "@ui-sdk/vue/dialog",
  })
})

test("controllers and helpers are auto-imported, and components aren't", () => {
  expect(importsFrom("@ui-sdk/vue/dialog")).toEqual(["createDialogController"])
  expect(importsFrom("@ui-sdk/vue/toast")).toEqual(
    expect.arrayContaining(["createToaster", "toast"])
  )
  expect(importsFrom("@ui-sdk/vue/overlays")).toEqual([
    "createOverlays",
    "overlays",
  ])
})

test("the prefix renames components but keeps the name they're imported by", () => {
  expect(componentOf("UDialogTrigger", "U")).toEqual({
    name: "UDialogTrigger",
    export: "DialogTrigger",
    filePath: "@ui-sdk/vue/dialog",
  })
  expect(nuxtRegistrations(entries, "U").imports).toEqual(
    nuxtRegistrations(entries, "").imports
  )
})

test("an entry with no components only adds imports", () => {
  const date = entries.find(({ from }) => from === "@ui-sdk/vue/date")
  expect(date?.components).toEqual([])
  expect(importsFrom("@ui-sdk/vue/date")).toContain("parseDate")
})

test("auto-imports rank below the app's and its layers' own", () => {
  for (const { priority } of nuxtRegistrations(entries, "").imports) {
    expect(priority).toBeLessThan(-100)
  }
})

test("an entry with nothing to register adds neither components nor imports", () => {
  const empty = [{ from: "@ui-sdk/vue/empty", components: [], imports: [] }]
  expect(nuxtRegistrations(empty, "")).toEqual({ components: [], imports: [] })
})

test("a name two entries export is registered once, from the entry it's named for", () => {
  const owners = (name: string) =>
    entries.filter(({ components, imports }) =>
      [...components, ...imports].includes(name)
    )
  expect(owners("CalendarDay").map(({ from }) => from)).toEqual([
    "@ui-sdk/vue/calendar",
  ])
  expect(owners("createInputController").map(({ from }) => from)).toEqual([
    "@ui-sdk/vue/input",
  ])
})

test("a function named like a browser global isn't auto-imported", () => {
  expect(importsFrom("@ui-sdk/vue/alert-dialog")).not.toContain("confirm")
  expect(importsFrom("@ui-sdk/vue/alert-dialog")).toContain("createConfirm")
})

test("the root entry and the Nuxt module itself aren't listed", () => {
  const listed = entries.map(({ from }) => from)
  expect(listed).not.toContain("@ui-sdk/vue")
  expect(listed).not.toContain("@ui-sdk/vue/nuxt")
  expect(listed).toContain("@ui-sdk/vue/primitive")
})
