// @vitest-environment jsdom
// Every option and slot prop follows a change after the first render, set as
// a property on the custom elements, as in packages/core/test/after-mount.test.ts.
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  baseOptions,
  type Built,
  callbackRelays,
  changesOf,
  idle,
  markupOf,
  partsOf,
  relayedKeys,
  tabStopProblem,
  title,
  withAttribute,
} from "../../core/test/after-mount"
import { cases, type Case } from "../../core/test/after-mount.cases"

// Each tag's `target`, which picks the native element a wrapper part binds.
const targets = vi.hoisted(
  () => new Map<string, (el: HTMLElement) => HTMLElement | null>()
)
vi.mock("../src/define-element", async (original) => {
  const module = await original<typeof import("../src/define-element")>()
  const record = (
    options?:
      string | { tag: string; target?: (el: HTMLElement) => HTMLElement | null }
  ) => {
    if (typeof options === "object" && options.target) {
      targets.set(options.tag, options.target)
    }
  }
  const createParts: typeof module.createParts = (primitive, tags) => {
    Object.values(tags).forEach(record)
    return module.createParts(primitive, tags)
  }
  const definePart: typeof module.definePart = (primitive, slot, options) => {
    record(options)
    module.definePart(primitive, slot, options)
  }
  return { ...module, createParts, definePart }
})

// jsdom has no Web Animations API, no form values and no layout: nothing
// animates, and every element in the page renders, at no size.
Element.prototype.getAnimations ??= () => []
Element.prototype.scrollIntoView ??= () => {}
ElementInternals.prototype.setFormValue ??= () => {}
ElementInternals.prototype.setValidity ??= () => {}
Element.prototype.getClientRects = function () {
  const rects = this.isConnected ? [this.getBoundingClientRect()] : []
  return Object.assign(rects, { item: (index: number) => rects[index] ?? null })
}
await Promise.all(
  Object.values(import.meta.glob("../src/entries/*.ts")).map((load) => load())
)

// Vite's `import.meta.glob`, which Vite rewrites where it's written. This package doesn't load Vite's types.
declare global {
  interface ImportMeta {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>
  }
}

const tagOf = (name: string) =>
  "ui-" +
  name
    .replace("OTP", "Otp")
    .replace(/[A-Z]/g, (char, index) => (index ? "-" : "") + char.toLowerCase())

// Slots a native element fills, found inside its owner.
const natives: Record<string, string> = {
  AvatarImage: "img",
  FieldControl: "input",
  PasswordInputControl: "input",
}
// Roots that bind a native field inside them.
const fields: Record<string, string> = {
  "ui-input": "input",
  "ui-textarea": "textarea",
}
const has = (name: string) =>
  name in natives || !!customElements.get(tagOf(name))

// The native element a wrapper binds, found by offering it each kind.
function wrapperOf(tag: string) {
  const target = targets.get(tag)
  if (!target) {
    return
  }
  const probe = document.createElement(tag)
  const kinds = ["button", "a", "input", "textarea", "select"]
  probe.append(
    document.createElement("span"),
    ...kinds.map((kind) => document.createElement(kind))
  )
  const found = target(probe)
  return found &&
    found.parentElement === probe &&
    kinds.includes(found.localName)
    ? found.localName
    : undefined
}

const asAttribute = (name: string) =>
  /[-:]/.test(name) ||
  ["class", "id", "role", "href", "for", "form"].includes(name)

function apply(
  el: Element,
  props: Record<string, unknown>,
  before: Record<string, unknown> = {}
) {
  for (const name in before) {
    if (!(name in props)) {
      if (asAttribute(name)) {
        el.removeAttribute(name)
      } else {
        ;(el as unknown as Record<string, unknown>)[name] = undefined
      }
    }
  }
  for (const [name, value] of Object.entries(props)) {
    if (!asAttribute(name)) {
      ;(el as unknown as Record<string, unknown>)[name] = value
    } else if (value === undefined || value === false) {
      el.removeAttribute(name)
    } else {
      el.setAttribute(name, value === true ? "" : String(value))
    }
  }
  // jsdom never tells a form-associated element its disabled state changed, as a browser does.
  const form = el as Element & {
    formDisabledCallback?: (disabled: boolean) => void
  }
  if (props.disabled !== before.disabled) {
    form.formDisabledCallback?.(el.hasAttribute("disabled"))
  }
}

// The elements for a tree, with each node's element, to set props on later.
function build(nodes: Built[], made: Element[]): Node[] {
  return nodes.flatMap((node): Node[] => {
    if (typeof node === "string") {
      return [document.createTextNode(node)]
    }
    const children = () => build(node.children, made)
    if (!node.part && !node.tag) {
      return children()
    }
    const tag = node.part ? (natives[node.part] ?? tagOf(node.part)) : node.tag!
    const el = document.createElement(tag)
    made.push(el)
    apply(el, node.props)
    const wrapper = node.part && (wrapperOf(tag) ?? fields[tag])
    if (wrapper) {
      const inner = document.createElement(wrapper)
      if (!["input", "textarea", "select"].includes(wrapper)) {
        inner.append(...children())
      }
      el.append(inner)
    } else {
      el.append(...children())
    }
    return [el]
  })
}

// The tree's props in the order `build` made its elements.
function propsOf(nodes: Built[]): Record<string, unknown>[] {
  return nodes.flatMap((node) =>
    typeof node === "string"
      ? []
      : [
          ...(node.part || node.tag ? [node.props] : []),
          ...propsOf(node.children),
        ]
  )
}

let container: HTMLElement | undefined

async function show(trees: Built[][]) {
  container = document.body.appendChild(document.createElement("div"))
  const made: Element[] = []
  container.append(...build(trees[0]!, made))
  await idle()
  let before = propsOf(trees[0]!)
  for (const tree of trees.slice(1)) {
    const next = propsOf(tree)
    made.forEach((el, index) => apply(el, next[index]!, before[index]))
    before = next
    await idle()
  }
  await idle()
}

// A part that isn't shown stays in the page, hidden, with what it and the
// parts in it last wrote, which a part never shown doesn't have. Only that
// it's hidden counts.
function hiddenParts(el: Element) {
  const copy = el.cloneNode(true) as Element
  for (const part of [
    copy,
    ...copy.querySelectorAll('[data-slot][hidden=""]'),
  ]) {
    if (part.matches('[data-slot][hidden=""]')) {
      for (const inside of [part, ...part.querySelectorAll("*")]) {
        for (const { name } of [...inside.attributes]) {
          if (name !== "hidden" && name !== "data-slot") {
            inside.removeAttribute(name)
          }
        }
      }
    }
  }
  return copy
}

// The page as the case renders it: its own markup, then what it moved to the
// body, like a popup, in an order moves don't change. Announcers are shared.
function pageOf(entry: Case) {
  const portaled = [...document.body.children].filter(
    (el) => el !== container && !el.hasAttribute("data-ui-sdk-announcer")
  )
  const ids = /mount-\d+|\bauto-\d+|(?<=ui-sdk-[0-9a-z-]+-)\d+/g
  const markup = (el: Element) => markupOf(hiddenParts(el), entry.history, ids)
  return [markup(container!), ...portaled.map(markup).sort()].join("\n")
}

function release() {
  document.body.replaceChildren()
  container = undefined
}

afterEach(release)

// A state property writes through the api, as a controller does, so opening
// moves focus to the first item and a query filters, where a first render doesn't.
const likeAController = new Set([
  "menu > open: false to true",
  'select > query: "" to "a"',
  'select > query: "a" to ""',
  'combobox > query: "" to "a"',
])

for (const entry of cases) {
  describe(entry.name, () => {
    const { changes } = changesOf(entry)
    for (const change of changes) {
      test.skipIf(
        title(change) in (entry.skip ?? {}) ||
          likeAController.has(`${entry.name} > ${title(change)}`)
      )(title(change), async () => {
        const base = baseOptions(entry, change)
        const markupAt = (value: unknown) =>
          change.kind === "prop"
            ? withAttribute(entry.markup, change, value)
            : entry.markup
        const optionsAt = (value: unknown) =>
          change.kind === "option" ? { ...base, [change.key]: value } : base
        const tree = (value: unknown) =>
          partsOf(entry, markupAt(value), optionsAt(value), has)

        await show([tree(change.to)])
        const expected = pageOf(entry)
        const freshProblem = tabStopProblem({ root: document.body })
        release()

        relayedKeys()
        await show([tree(change.from), tree(change.to)])
        expect(pageOf(entry)).toEqual(expected)
        if (entry.history?.includes("stop") && !freshProblem) {
          expect(tabStopProblem({ root: document.body })).toBeUndefined()
        }
        // Each property is its own change, so one that relays elsewhere may not here.
        const relays = callbackRelays[`${entry.name} > ${title(change)}`] ?? []
        expect(relays).toEqual(expect.arrayContaining(relayedKeys()))
      })
    }
  })
}
