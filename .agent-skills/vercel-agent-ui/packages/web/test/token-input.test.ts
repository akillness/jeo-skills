// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { instanceOf } from "../src/define-element"
import { defineFieldElements } from "../src/field"
import { defineTokenInputElements } from "../src/token-input"
import { defineTriggerMenuElements } from "../src/trigger-menu"

const wait = () => new Promise((resolve) => setTimeout(resolve, 20))

afterEach(() => document.body.replaceChildren())

function tokenInputs(count: number) {
  ElementInternals.prototype.setFormValue ??= () => {}
  ElementInternals.prototype.setValidity ??= () => {}
  defineTokenInputElements()
  defineTriggerMenuElements()
  const editor = `<ui-token-input-editor aria-label="Prompt"></ui-token-input-editor>`
  document.body.innerHTML =
    `<ui-token-input>${editor}<ui-trigger-menu></ui-trigger-menu></ui-token-input>` +
    `<ui-token-input>${editor}</ui-token-input>`.repeat(count - 1)
  const inputs = [...document.querySelectorAll("ui-token-input")]
  const menu = document.querySelector("ui-trigger-menu")!
  // The editor a token input has now, and the one its trigger menu suggests into.
  const editorOf = (input: Element) =>
    instanceOf<{ editor: object }>(input)?.api.editor
  const used = () => instanceOf(menu)?.get() as { editor?: object } | undefined
  return { inputs, menu, editor: editorOf, used }
}

test("a token input put back on the page gives its trigger menu its new editor", async () => {
  const { inputs, editor, used } = tokenInputs(1)
  await wait()
  const first = editor(inputs[0])
  expect(used()?.editor).toBe(first)
  inputs[0].remove()
  await wait()
  document.body.append(inputs[0])
  await wait()
  expect(editor(inputs[0])).not.toBe(first)
  expect(used()?.editor).toBe(editor(inputs[0]))
})

test("a trigger menu moved into another token input suggests into that one's editor", async () => {
  const { inputs, menu, editor, used } = tokenInputs(2)
  await wait()
  menu.remove()
  await wait()
  inputs[1].append(menu)
  await wait()
  expect(used()?.editor).toBe(editor(inputs[1]))
})

// What each token's host shows: its content, then its kind.
const hosts = () =>
  [...document.querySelectorAll("[data-slot='token-input-host']")].map(
    (host) => host.textContent
  )

test("tokens a token input starts with show only their template", async () => {
  tokenInputs(1)
  document.body.innerHTML = `
    <ui-token-input value="Open [@routes.ts](file:routes.ts)">
      <ui-token-input-editor aria-label="Prompt"></ui-token-input-editor>
      <template><ui-token-input-token><span data-token-label></span></ui-token-input-token></template>
    </ui-token-input>`
  await wait()
  expect(hosts()).toEqual(["routes.ts file"])
  expect(document.querySelectorAll("ui-token-input-token")).toHaveLength(1)
})

test("tokens show only what renderToken renders when it's set after mount, and their label once it's unset", async () => {
  tokenInputs(1)
  document.body.innerHTML = `
    <ui-token-input value="Open [@routes.ts](file:routes.ts)">
      <ui-token-input-editor aria-label="Prompt"></ui-token-input-editor>
    </ui-token-input>`
  await wait()
  expect(hosts()).toEqual(["routes.ts file"])
  const input = document.querySelector("ui-token-input") as HTMLElement & {
    renderToken?: (token: { label: string }, host: HTMLElement) => void
  }
  input.renderToken = (token, host) => host.replaceChildren(`[${token.label}]`)
  await wait()
  expect(hosts()).toEqual(["[routes.ts] file"])
  input.renderToken = undefined
  await wait()
  expect(hosts()).toEqual(["routes.ts file"])
})

test("a new renderToken renders into the nodes the last one left, for renderers that keep them per container", async () => {
  tokenInputs(1)
  document.body.innerHTML = `
    <ui-token-input value="Open [@routes.ts](file:routes.ts)">
      <ui-token-input-editor aria-label="Prompt"></ui-token-input-editor>
    </ui-token-input>`
  const input = document.querySelector("ui-token-input") as HTMLElement & {
    renderToken?: (token: { label: string }, host: HTMLElement) => void
  }
  const nodes = new WeakMap<HTMLElement, Text>()
  const renderWith =
    (prefix: string) => (token: { label: string }, host: HTMLElement) => {
      let node = nodes.get(host)
      if (!node) {
        nodes.set(host, (node = host.appendChild(document.createTextNode(""))))
      }
      node.textContent = `${prefix} ${token.label}`
    }
  input.renderToken = renderWith("First")
  await wait()
  expect(hosts()).toEqual(["First routes.ts file"])
  input.renderToken = renderWith("Second")
  await wait()
  expect(hosts()).toEqual(["Second routes.ts file"])
})

test("a disabled field disables the token input inside it, which then submits and requires nothing", async () => {
  const submitted = new Map<ElementInternals, unknown>()
  const missing = new Map<ElementInternals, boolean>()
  const { setFormValue, setValidity } = ElementInternals.prototype
  ElementInternals.prototype.setFormValue = function (value) {
    submitted.set(this, value)
  }
  ElementInternals.prototype.setValidity = function (flags) {
    missing.set(this, !!flags?.valueMissing)
  }
  try {
    defineFieldElements()
    defineTokenInputElements()
    document.body.innerHTML = `
      <ui-field disabled>
        <ui-field-label>Prompt</ui-field-label>
        <ui-token-input name="prompt" required>
          <ui-token-input-editor></ui-token-input-editor>
        </ui-token-input>
      </ui-field>`
    await wait()
    const field = document.querySelector("ui-field")!
    const editor = document.querySelector("ui-token-input-editor")!
    const [internals] = submitted.keys()
    expect(editor.getAttribute("contenteditable")).toBe("false")
    expect(editor.getAttribute("aria-disabled")).toBe("true")
    expect(submitted.get(internals)).toBeNull()
    expect(missing.get(internals)).toBe(false)

    field.removeAttribute("disabled")
    await wait()
    expect(editor.getAttribute("contenteditable")).toBe("true")
    expect(editor.hasAttribute("aria-disabled")).toBe(false)
    expect(submitted.get(internals)).toBe("")
    expect(missing.get(internals)).toBe(true)

    field.setAttribute("disabled", "")
    await wait()
    expect(editor.getAttribute("contenteditable")).toBe("false")
    expect(submitted.get(internals)).toBeNull()
  } finally {
    ElementInternals.prototype.setFormValue = setFormValue
    ElementInternals.prototype.setValidity = setValidity
  }
})

async function tokenInputInFields() {
  const submitted = new Map<ElementInternals, unknown>()
  ElementInternals.prototype.setValidity ??= () => {}
  const { setFormValue } = ElementInternals.prototype
  ElementInternals.prototype.setFormValue = function (value) {
    submitted.set(this, value)
  }
  defineFieldElements()
  defineTokenInputElements()
  document.body.innerHTML = `
    <ui-field id="disabled" disabled>
      <ui-token-input name="prompt" value="Hello">
        <ui-token-input-editor aria-label="Prompt"></ui-token-input-editor>
      </ui-token-input>
    </ui-field>
    <ui-field id="enabled"></ui-field>`
  await wait()
  const [internals] = submitted.keys()
  return {
    input: document.querySelector("ui-token-input")!,
    editor: document.querySelector("ui-token-input-editor")!,
    submitted: () => submitted.get(internals),
    restore: () => (ElementInternals.prototype.setFormValue = setFormValue),
  }
}

test("a token input moved out of a disabled field is editable again and submits its value", async () => {
  const { input, editor, submitted, restore } = await tokenInputInFields()
  try {
    expect(editor.getAttribute("contenteditable")).toBe("false")
    expect(submitted()).toBeNull()
    document.getElementById("enabled")!.append(input)
    await wait()
    expect(editor.getAttribute("contenteditable")).toBe("true")
    expect(submitted()).toBe("Hello")
  } finally {
    restore()
  }
})

test("a token input moved into a disabled field is disabled and submits nothing", async () => {
  const { input, editor, submitted, restore } = await tokenInputInFields()
  try {
    document.getElementById("enabled")!.append(input)
    await wait()
    expect(submitted()).toBe("Hello")
    document.getElementById("disabled")!.append(input)
    await wait()
    expect(editor.getAttribute("contenteditable")).toBe("false")
    expect(submitted()).toBeNull()
  } finally {
    restore()
  }
})
