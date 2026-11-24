// @vitest-environment jsdom
// A part element's events are typed from its slot's callbacks (`PartEvents`
// in events.ts), unless its define call fires others. This reads each part's
// typed events with the type checker, presses the parts, and checks each
// fires exactly those, so the types can't drift from the runtime.
import path from "node:path"
import type { AccordionValueChangeReason } from "@ui-sdk/core/accordion"
import ts from "typescript"
import {
  afterAll,
  afterEach,
  beforeAll,
  expect,
  expectTypeOf,
  test,
  vi,
} from "vitest"
import { defineAccordionElements } from "../src/accordion"
import { defineComboboxElements } from "../src/combobox"
import { defineCommandElements } from "../src/command"
import { defineAlertDialogElements, defineDialogElements } from "../src/dialog"
import { defineDrawerElements } from "../src/drawer"
import type { UiToastRegionElement } from "../src/events"
import { defineMenuElements } from "../src/menu"
import { createToaster, defineToastElements } from "../src/toast"
import { defineTriggerMenuElements } from "../src/trigger-menu"

// The parts this file presses: every part whose type lists events, and two
// whose owner fires their slot's callback instead, the combobox's `create`
// and the trigger menu's `itemselect`.
const pressed = [
  "ui-accordion-item",
  "ui-menu-item",
  "ui-menu-checkbox-item",
  "ui-menu-radio-group",
  "ui-command-item",
  "ui-trigger-menu-item",
  "ui-combobox-create",
  "ui-dialog-close",
  "ui-alert-dialog-close",
  "ui-drawer-close",
  "ui-toast-action",
  "ui-toast-close",
] as const

const events = path.resolve(import.meta.dirname, "../src/events.ts")

// The events each part's entry in `HTMLElementTagNameMap` types, by tag:
// the event map its `UiElement` takes.
function typedPartEvents() {
  const config = ts.getParsedCommandLineOfConfigFile(
    path.resolve(import.meta.dirname, "../tsconfig.json"),
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} }
  )!
  const program = ts.createProgram([events], config.options)
  const checker = program.getTypeChecker()
  const tagMap = program
    .getSourceFile(events)!
    .statements.filter(ts.isModuleDeclaration)
    .flatMap((node) =>
      node.body && ts.isModuleBlock(node.body) ? node.body.statements : []
    )
    .find(
      (node): node is ts.InterfaceDeclaration =>
        ts.isInterfaceDeclaration(node) &&
        node.name.text === "HTMLElementTagNameMap"
    )!
  const typed = new Map<string, string[]>()
  for (const member of tagMap.members) {
    if (
      !ts.isPropertySignature(member) ||
      !member.type ||
      !ts.isTypeReferenceNode(member.type)
    ) {
      continue
    }
    if (member.type.typeName.getText() !== "UiPartElement") {
      continue
    }
    const element = checker.getTypeFromTypeNode(member.type)
    const base = (element.isIntersection() ? element.types : [element]).find(
      (type) => type.symbol?.name === "UiElement"
    ) as ts.TypeReference
    const names = checker
      .getPropertiesOfType(checker.getTypeArguments(base)[0])
      .map(({ name }) => name)
    typed.set((member.name as ts.StringLiteral).text, names.sort())
  }
  return typed
}

// jsdom has no Web Animations API, which closing a popup asks for, no
// ResizeObserver, which a toast measures itself with, and no form values.
Element.prototype.getAnimations ??= () => []
ElementInternals.prototype.setFormValue ??= () => {}
ElementInternals.prototype.setValidity ??= () => {}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

// The events each part's type lists, and every custom event each one fired, by tag.
let typed: Map<string, string[]>
const fired = new Map<string, Set<string>>()
const dispatchEvent = EventTarget.prototype.dispatchEvent

// Reading the types takes longer than a hook's default timeout on a busy machine.
beforeAll(() => {
  typed = typedPartEvents()
  defineAccordionElements()
  defineMenuElements()
  defineCommandElements()
  defineTriggerMenuElements()
  defineComboboxElements()
  defineDialogElements()
  defineAlertDialogElements()
  defineDrawerElements()
  defineToastElements()
  EventTarget.prototype.dispatchEvent = function (
    this: EventTarget,
    event: Event
  ) {
    if (
      event instanceof CustomEvent &&
      this instanceof Element &&
      typed.has(this.localName)
    ) {
      fired.set(
        this.localName,
        (fired.get(this.localName) ?? new Set()).add(event.type)
      )
    }
    return dispatchEvent.call(this, event)
  }
}, 120_000)

afterAll(() => {
  EventTarget.prototype.dispatchEvent = dispatchEvent
})

afterEach(() => {
  document.body.replaceChildren()
  fired.clear()
})

const pressable = (name: string) =>
  [
    ...document.querySelectorAll<HTMLElement>(
      "button, [role^=menuitem], [role=option]"
    ),
  ].find((el) => el.textContent?.trim() === name)!

function expectFires(tag: (typeof pressed)[number]) {
  expect([...(fired.get(tag) ?? [])].sort(), tag).toEqual(typed.get(tag))
}

test("every part whose type lists events is pressed here", () => {
  expect(typed.size).toBeGreaterThan(100)
  const untested = [...typed].filter(
    ([tag, names]) =>
      names.length && !(pressed as readonly string[]).includes(tag)
  )
  expect(untested).toEqual([])
})

test("a part's event listener gets its typed detail", () => {
  const item = document.createElement("ui-accordion-item")
  item.addEventListener("openchange", (event) => {
    expectTypeOf(event.detail.value).toEqualTypeOf<boolean>()
    expectTypeOf(
      event.detail.reason
    ).toEqualTypeOf<AccordionValueChangeReason>()
  })
  document.createElement("ui-menu-item").addEventListener("select", (event) => {
    expectTypeOf(event.detail.value).toEqualTypeOf<Event>()
  })
  document
    .createElement("ui-command-item")
    .addEventListener("select", (event) => {
      expectTypeOf(event.detail.waitUntil).toEqualTypeOf<
        (promise: Promise<unknown>) => void
      >()
    })
  document
    .createElement("ui-trigger-menu")
    .addEventListener("itemselect", (event) => {
      expectTypeOf(event.detail.value).toEqualTypeOf<string>()
    })
  document
    .createElement("ui-dialog-close")
    .addEventListener("action", (event) => {
      expectTypeOf(event.detail.waitUntil).toEqualTypeOf<
        (promise: Promise<unknown>) => void
      >()
    })
})

test("an accordion item fires openchange and openchangecomplete", async () => {
  document.body.innerHTML = `
    <ui-accordion>
      <ui-accordion-item value="a">
        <ui-accordion-header><ui-accordion-trigger><button>A</button></ui-accordion-trigger></ui-accordion-header>
        <ui-accordion-panel>Panel</ui-accordion-panel>
      </ui-accordion-item>
    </ui-accordion>`
  await wait()
  pressable("A").click()
  await vi.waitFor(() => expectFires("ui-accordion-item"))
})

test("a menu's items fire select, checkedchange and valuechange", async () => {
  document.body.innerHTML = `
    <ui-menu open close-on-select="false">
      <ui-menu-trigger><button>File</button></ui-menu-trigger>
      <ui-menu-content>
        <ui-menu-item value="new">New</ui-menu-item>
        <ui-menu-checkbox-item value="wrap">Wrap</ui-menu-checkbox-item>
        <ui-menu-radio-group name="size">
          <ui-menu-radio-item value="small">Small</ui-menu-radio-item>
        </ui-menu-radio-group>
      </ui-menu-content>
    </ui-menu>`
  await wait()
  for (const name of ["New", "Wrap", "Small"]) {
    pressable(name).click()
  }
  await wait()
  expectFires("ui-menu-item")
  expectFires("ui-menu-checkbox-item")
  expectFires("ui-menu-radio-group")
})

test("a command item fires select", async () => {
  document.body.innerHTML = `
    <ui-command>
      <ui-command-input><input aria-label="Search" /></ui-command-input>
      <ui-command-list><ui-command-item value="profile">Profile</ui-command-item></ui-command-list>
    </ui-command>`
  await wait()
  pressable("Profile").click()
  await wait()
  expectFires("ui-command-item")
})

test("a trigger menu item fires nothing itself", async () => {
  document.body.innerHTML = `
    <ui-trigger-menu>
      <ui-trigger-menu-input><textarea aria-label="Message"></textarea></ui-trigger-menu-input>
      <ui-trigger-menu-content>
        <ui-trigger-menu-list><ui-trigger-menu-item value="ada">Ada</ui-trigger-menu-item></ui-trigger-menu-list>
      </ui-trigger-menu-content>
    </ui-trigger-menu>`
  const menu = document.querySelector("ui-trigger-menu")!
  menu.triggers = [{ char: "@" }]
  await wait()
  const selected: unknown[] = []
  menu.addEventListener("itemselect", (event) => selected.push(event.detail))
  void menu.api.open({ trigger: "@" })
  await wait()
  pressable("Ada").click()
  await wait()
  // The browser's own `select`, for selected text, bubbles up from the field.
  document.querySelector("textarea")!.select()
  expect(selected).toEqual([
    expect.objectContaining({ value: "ada", trigger: "@" }),
  ])
  expectFires("ui-trigger-menu-item")
})

test("a combobox's create part fires nothing itself", async () => {
  document.body.innerHTML = `
    <ui-combobox>
      <ui-combobox-input><input aria-label="Fruit" /></ui-combobox-input>
      <ui-combobox-content>
        <ui-combobox-list>
          <ui-combobox-item value="apple">Apple</ui-combobox-item>
          <ui-combobox-create>Create</ui-combobox-create>
        </ui-combobox-list>
      </ui-combobox-content>
    </ui-combobox>`
  const combobox = document.querySelector("ui-combobox")!
  await wait()
  const created: string[] = []
  combobox.addEventListener("create", (event) =>
    created.push(event.detail.value)
  )
  const input = document.querySelector("input")!
  input.value = "kiwi"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await wait()
  pressable("Create").click()
  await wait()
  expect(created).toEqual(["kiwi"])
  expectFires("ui-combobox-create")
})

test("a dialog's, an alert dialog's and a drawer's close fire action", async () => {
  document.body.innerHTML = ["dialog", "alert-dialog", "drawer"]
    .map(
      (name) => `
        <ui-${name} open>
          <ui-${name}-content>
            <ui-${name}-title>Draft</ui-${name}-title>
            <ui-${name}-close action><button>Save ${name}</button></ui-${name}-close>
          </ui-${name}-content>
        </ui-${name}>`
    )
    .join("")
  await wait()
  for (const name of ["dialog", "alert-dialog", "drawer"]) {
    pressable(`Save ${name}`).click()
  }
  await wait()
  expectFires("ui-dialog-close")
  expectFires("ui-alert-dialog-close")
  expectFires("ui-drawer-close")
})

test("a toast's action and close fire action", async () => {
  document.body.innerHTML = `
    <ui-toast-region>
      <template>
        <ui-toast>
          <ui-toast-title></ui-toast-title>
          <ui-toast-action action><button>Undo</button></ui-toast-action>
          <ui-toast-close action><button>Dismiss</button></ui-toast-close>
        </ui-toast>
      </template>
    </ui-toast-region>`
  const toaster = createToaster()
  const region = document.querySelector(
    "ui-toast-region"
  ) as UiToastRegionElement
  region.toaster = toaster
  toaster("Deleted", {
    duration: Infinity,
    action: { label: "Undo", onAction: () => {} },
  })
  await wait()
  const [undo, dismiss] = [pressable("Undo"), pressable("Dismiss")]
  undo.click()
  dismiss.click()
  await wait()
  expectFires("ui-toast-action")
  expectFires("ui-toast-close")
})
