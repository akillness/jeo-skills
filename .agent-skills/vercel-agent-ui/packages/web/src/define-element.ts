import type {
  OptionsOf,
  Part as InstancePart,
  Primitive,
  PrimitiveInstance,
  PropSpec,
  SlotName,
  TypesOf,
} from "@ui-sdk/core"
import {
  applyAttrs,
  attachFormInternals,
  attrs as partAttrs,
  bind,
  bindElementInternals,
  conditional,
  connect,
  elementMoved,
  type Feature,
  formCallback,
  inDocumentOrder,
  markAuthored,
  portalTarget,
  present as isPresent,
  type PrimitiveSchema,
  releaseAttrs,
  renderVersion,
  schemaOf,
  selectedKeys,
  subscribe,
  validityChanged,
  warn,
  writeFromScript,
  writeStyle,
} from "@ui-sdk/core/renderer"
import { waitList } from "./action"

const autoIds = new WeakMap<Element, string>()
let count = 0

// The tags this copy of ui-sdk defined.
const claimed = new Set<string>()

/**
 * Whether to define a tag now. Never on the server, where importing a component
 * does nothing, and once per tag. A tag that another library or another copy
 * of ui-sdk defined first keeps that definition, with a warning.
 */
function claimTag(tagName: string) {
  if (typeof customElements === "undefined" || claimed.has(tagName)) {
    return false
  }
  if (customElements.get(tagName)) {
    warn(
      `<${tagName}> is already defined by another library or another copy of ui-sdk. This one is skipped.`
    )
    return false
  }
  claimed.add(tagName)
  return true
}

/** A stable id for any element, for parts that need a key and have none. */
function autoId(el: Element) {
  if (!autoIds.has(el)) {
    autoIds.set(el, `auto-${++count}`)
  }
  return autoIds.get(el)!
}

/**
 * The button or link a wrapper part holds, like the <button> in <ui-tabs-tab>
 * or in a <ui-button> there, so the part binds to it and native button
 * behavior stays.
 * @stable
 */
function wrappedButton(el: HTMLElement) {
  return (
    el.querySelector<HTMLElement>(
      ":scope > button, :scope > a, :scope > ui-button > button, :scope > ui-button > a"
    ) ?? (el.firstElementChild as HTMLElement | null)
  )
}

/**
 * A `target` for a wrapper part: its child matching `selector`, like the
 * <input> in <ui-combobox-input>, else its first child.
 * @stable
 */
const wrappedChild = (selector: string) => (el: HTMLElement) =>
  el.querySelector<HTMLElement>(`:scope > ${selector}`) ??
  (el.firstElementChild as HTMLElement | null)

/**
 * A `target` for a wrapper part that binds a button: the one written inside
 * it, else a new one holding what the part held. `fill` fills a button that
 * would be empty, like with an arrow or an icon.
 */
function ownButton(fill?: (button: HTMLButtonElement) => void) {
  return (el: HTMLElement) => {
    const written = wrappedButton(el)
    if (written) {
      return written
    }
    const button = el.ownerDocument.createElement("button")
    button.append(...el.childNodes)
    if (!button.textContent?.trim()) {
      fill?.(button)
    }
    el.append(button)
    return button
  }
}

// The element a part, or an owner's own slot, binds: what `target` picks, like
// a wrapped button, else its first child with as-child, else itself.
function boundElement(
  el: HTMLElement,
  target?: (el: HTMLElement) => HTMLElement | null
) {
  if (target) {
    return target(el)
  }
  return el.hasAttribute("as-child")
    ? (el.firstElementChild as HTMLElement | null)
    : el
}

// A part's key, as core tells parts of one slot apart. A new key is a new
// part, so it binds again, like a scrollbar keyed by its orientation.
const rekeyed = (
  previous: Record<string, unknown>,
  next: Record<string, unknown>
) => previous.id !== next.id || previous.value !== next.value

const kebab = (name: string) =>
  name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)

// Author writes core can't tell apart by value, like their own `role` or
// `aria-disabled` set to what the part rendered, are heard instead. Any other
// value, or a removal, shows when the part lets go of the element.
const semantics = ["role", "aria-disabled"]

/**
 * How an attribute becomes an option or prop. `"boolean"`: present, empty or
 * `"true"` is true and `"false"` is false, except `disabled` and `required`,
 * which are true whenever present, as on native controls. `"number"`: a number. `"list"`:
 * comma-separated values. `"string"`: the value as written. A function parses
 * anything else, like `modal`, which is a boolean or a string.
 * @stable
 */
type AttributeType =
  "boolean" | "number" | "string" | "list" | ((value: string | null) => unknown)

/**
 * An attribute's value as an option. Missing attributes are undefined, so the
 * component's default applies.
 */
function parseAttribute(type: AttributeType, value: string | null) {
  if (value === null) {
    return undefined
  }
  if (typeof type === "function") {
    return type(value)
  }
  if (type === "boolean") {
    return value !== "false"
  }
  if (type === "number") {
    const number = Number(value)
    return value.trim() === "" || Number.isNaN(number) ? undefined : number
  }
  if (type === "list") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return value
}

// Attributes that native controls read by presence. A browser disables a
// form-associated element with `disabled="false"`, so the option agrees.
const presence = new Set(["disabled", "required"])

// An option or prop from its attribute, undefined when it's missing.
function readAttribute(el: HTMLElement, name: string, type: AttributeType) {
  const value = el.getAttribute(kebab(name))
  if (type === "boolean" && presence.has(name)) {
    return value === null ? undefined : true
  }
  return parseAttribute(type, value)
}

// Options or props from an element's attributes, by schema.
function readAttributes(
  el: HTMLElement,
  schema: Record<string, AttributeType>
) {
  const result: Record<string, unknown> = {}
  for (const [name, type] of Object.entries(schema)) {
    const value = readAttribute(el, name, type)
    if (value !== undefined) {
      result[name] = value
    }
  }
  return result
}

// Boolean options that start on, like `{ loop: true }`, or whose start an
// element decides, like a dialog's `closeOnOutsidePress`, which is on while it's modal.
type BooleanDefaults = Record<string, boolean | ((el: HTMLElement) => boolean)>

const defaultOn = (
  el: HTMLElement,
  value: BooleanDefaults[string] | undefined
) => (typeof value === "function" ? value(el) : value)

// A property for each attribute option the element doesn't have yet, which
// reflects it, like an input's `disabled`. Booleans go by presence, so
// `false` removes the attribute, except ones that start on, like `loop`,
// which write "false", like `spellcheck`. A parsed attribute, like a
// three-way `invalid`, writes "false" too. Lists join with commas.
function reflectAttributes(
  proto: HTMLElement,
  schema: Record<string, AttributeType>,
  defaults: BooleanDefaults = {}
) {
  for (const [name, type] of Object.entries(schema)) {
    if (name in proto) {
      continue
    }
    const attribute = kebab(name)
    Object.defineProperty(proto, name, {
      configurable: true,
      get(this: HTMLElement) {
        return (
          readAttribute(this, name, type) ??
          defaultOn(this, defaults[name]) ??
          (type === "boolean" ? false : undefined)
        )
      },
      set(this: HTMLElement, value: unknown) {
        const removes =
          value === false &&
          type === "boolean" &&
          !defaultOn(this, defaults[name])
        if (value == null || removes) {
          this.removeAttribute(attribute)
        } else {
          this.setAttribute(
            attribute,
            value === true
              ? ""
              : Array.isArray(value)
                ? value.join(",")
                : String(value)
          )
        }
      },
    })
  }
}

// A property set before the element upgraded is the element's own and hides
// the accessor. Sets it again through the accessor.
function upgradeProperties(el: HTMLElement, names: Iterable<string>) {
  for (const name of names) {
    if (!Object.prototype.hasOwnProperty.call(el, name)) {
      continue
    }
    const value = el[name as keyof HTMLElement]
    delete el[name as keyof HTMLElement]
    ;(el as unknown as Record<string, unknown>)[name] = value
  }
}

// Elements whose changes fire no events right now: state restored by the
// browser, or set from script, like a native control's.
const quiet = new Set<HTMLElement>()

// Restores state the browser handed over, quietly. Returns whether the element took it.
function restoreQuietly(el: HTMLElement, state: unknown, mode: string) {
  quiet.add(el)
  try {
    return formCallback(el, "restore", state, mode)
  } finally {
    quiet.delete(el)
  }
}

// A restore that waits for the parts to bind, by element. Anything newer that
// sets the state first wins: script, a state attribute, a reset or another restore.
const pendingRestores = new Map<HTMLElement, object>()

// State set from script, through a property, a state attribute or the `api`,
// wins over a waiting restore: the element's own, and a group's around it,
// which a checkbox writes through.
function wroteFromScript(el: HTMLElement) {
  for (const waiting of pendingRestores.keys()) {
    if (waiting.contains(el)) {
      pendingRestores.delete(waiting)
    }
  }
}

function restoreOnceBound(el: HTMLElement, state: unknown, mode: string) {
  const token = {}
  pendingRestores.set(el, token)
  queueMicrotask(() => {
    if (pendingRestores.get(el) !== token) {
      return
    }
    pendingRestores.delete(el)
    restoreQuietly(el, state, mode)
  })
}

// Whether `el` fires nothing right now. A part is quiet while its owner is,
// so setting an accordion's value moves its items without their events, and
// an element while one inside it is, like a group whose checkbox restores.
function quietNow(el: HTMLElement) {
  const owner = partOwners.get(el)
  if (quiet.has(el) || (!!owner && quiet.has(owner))) {
    return true
  }
  for (const inside of quiet) {
    if (el.contains(inside)) {
      return true
    }
  }
  return false
}

// Whether a callback's only argument is a details object, like
// onDismissAttempt's `{ reason, event }`, rather than a value.
function detailsOnly(value: unknown, details: unknown) {
  return (
    details === undefined &&
    !!value &&
    typeof value === "object" &&
    "reason" in value &&
    !(typeof Event !== "undefined" && value instanceof Event)
  )
}

// Option and prop callbacks become DOM events on `el`: onAction fires "action",
// onOpenChange fires "openchange". Canceling an event calls the change's
// `details.cancel()`, or cancels the event a callback receives, like onSelect's.
// A callback that only receives details, like onDismissAttempt, puts them in
// `detail` as they are. `silent` callbacks fire nothing, since a part element
// already reports them, and nothing fires while the element restores its
// state. Listeners can't return anything, so an `actions` callback's event
// hands them `waitUntil()` (see `action.ts`).
function withEvents<T extends object>(
  el: HTMLElement,
  target: T,
  silent: string[] = [],
  actions: string[] = [],
  names: Record<string, string> = {}
) {
  return new Proxy(target, {
    get(target, key) {
      if (key in target || typeof key !== "string" || !/^on[A-Z]/.test(key)) {
        return target[key as keyof T]
      }
      if (silent.includes(key)) {
        return undefined
      }
      return (
        value: unknown,
        details?: { cancel?: () => void; canceled?: boolean }
      ) => {
        if (quietNow(el)) {
          return
        }
        const only = detailsOnly(value, details)
        const { cancel, canceled, ...rest } = ((only ? value : details) ??
          {}) as {
          cancel?: () => void
          canceled?: boolean
        }
        const detail: Record<string, unknown> = only ? rest : { ...rest, value }
        const wait = actions.includes(key) ? waitList() : undefined
        if (wait) {
          detail.waitUntil = wait.waitUntil
        }
        // Only `el` hears it, like `toggle` on <details>, so a dialog never takes
        // the change of a dialog inside it for its own. A listener on an
        // ancestor hears every element inside it with `{ capture: true }`.
        // Composed, so a page that renders the element in a shadow root hears it on the host.
        const event = new CustomEvent(
          names[key] ?? key.slice(2).toLowerCase(),
          {
            detail,
            bubbles: false,
            // Only a change with details or an event to cancel is cancelable.
            cancelable:
              typeof cancel === "function" ||
              typeof (value as Event)?.preventDefault === "function",
            composed: true,
          }
        )
        const proceed = el.dispatchEvent(event)
        const waiting = wait?.done() ?? []
        if (!proceed) {
          if (typeof cancel === "function") {
            cancel()
          } else if (
            value &&
            typeof (value as Event).preventDefault === "function"
          ) {
            ;(value as Event).preventDefault()
          }
        }
        // One Promise, as the core takes it: a token's patch is what the last one resolves to.
        return waiting.length > 1
          ? Promise.all(waiting).then((values) => values.at(-1))
          : waiting[0]
      }
    },
  })
}

// Each owner element's instance, kept off the element, so a page reaches
// only its `api`: the controller's methods, never internals.
const instances = new WeakMap<Element, PrimitiveInstance>()

// The instance an owner element made, for this package's modules. The map
// holds every primitive's instances, so the caller names the api it expects.
function instanceOf<Api = unknown>(el: Element | null | undefined) {
  return (el ? instances.get(el) : undefined) as
    (PrimitiveInstance & { api: Api }) | undefined
}

// Controller methods that leave the state as it is.
const reads = /^(?:get|is|can)[A-Z]|^focus$/

// The element's public api: only the controller's methods, never internals.
function controllerView(el: HTMLElement, api: object, methods: string[]) {
  const view: Record<string, unknown> = {}
  for (const name of methods) {
    const method = (api as Record<string, unknown>)[name]
    if (typeof method === "function") {
      view[name] = (...args: unknown[]) => {
        if (!reads.test(name)) {
          wroteFromScript(el)
        }
        return method.apply(api, args)
      }
    }
  }
  return Object.freeze(view)
}

/**
 * A part's default CSS display. `contents` keeps it out of layout, for
 * wrappers, and the table values lay out parts that stand in for a table's
 * elements, like a calendar's weeks and days.
 */
type PartDisplay =
  | "block"
  | "contents"
  | "table"
  | "table-header-group"
  | "table-row-group"
  | "table-row"
  | "table-cell"

// Defaults that browsers give built-in elements but not custom ones, in the
// lowest cascade layer with zero specificity, so any class wins.
const display = new Map<string, PartDisplay>()
// Parts that take an `align` prop. Chromium and WebKit map `align` on any
// element to the legacy text alignment, so these inherit it instead.
const aligned = new Set<string>()
// The document's style with the rules, in its own cascade layer, declared
// first in the document, so it loses to every other style, including
// utilities that frameworks like Tailwind put in layers. Each copy of this
// package lists only the tags it defined, so each writes its own style,
// numbered across the copies on the page.
let styleId: string | undefined
function documentStyle() {
  if (styleId) {
    return styleId
  }
  const copies = globalThis as Record<symbol, number | undefined>
  const key = Symbol.for("ui-sdk.web-styles@1")
  copies[key] = (copies[key] ?? 0) + 1
  return (styleId = `ui-sdk-web-${copies[key]}`)
}
// The rules as the document's style has them, empty until a part needs one.
let css = ""
// Counts changes to the rules, so a copy of them knows it's behind.
let rulesVersion = 0
// The same rules for shadow roots, which the document's styles don't reach.
// One sheet for each document, since a constructed sheet can only be adopted
// into the document it was made for.
const constructed = new WeakMap<
  Document,
  { sheet: CSSStyleSheet; version: number }
>()
/**
 * Gives elements matching `selector` a default display, like a part's tag,
 * or the elements a part generates inside it.
 */
function setDisplay(selector: string, value?: PartDisplay, align = false) {
  if (align) {
    aligned.add(selector)
  }
  if (!value && !align) {
    return
  }
  if (value) {
    display.set(selector, value)
  }
  css = rules()
  writeStyle(document, documentStyle(), css)
  rulesVersion++
}

function rules() {
  return [
    "@layer ui-sdk {",
    // Parts that aren't shown stay hidden whatever display a class gives them.
    '  :where([data-slot][hidden]:not([hidden="until-found"])) { display: none !important }',
    // Content hidden until found is only hidden inside a box, so those keep theirs.
    ...[...display].map(
      ([selector, value]) =>
        `  :where(${selector}:not([hidden]), ${selector}[hidden="until-found"]) { display: ${value} }`
    ),
    ...[...aligned].map(
      (tag) => `  :where(${tag}[align]) { text-align: inherit }`
    ),
    // A part with as-child hands its role to its child, so it has no box of its own.
    "  :where([as-child]) { display: contents }",
    "}",
  ].join("\n")
}

// Gives the shadow root or other document an element renders in, if any,
// the rules `setDisplay` gives this document, like hidden parts staying hidden.
// Parts check again each time they sync, since a page can replace or change a
// root's sheets at any time, like Lit when its styles change, and nothing
// tells us it did.
function adoptStyles(el: HTMLElement) {
  const root = el.getRootNode()
  if (!isShadowRoot(root)) {
    return copyStyles(el.ownerDocument)
  }
  const shared = sharedSheet(root.ownerDocument)
  if (!shared || root.adoptedStyleSheets.includes(shared)) {
    return
  }
  root.adoptedStyleSheets = [shared, ...root.adoptedStyleSheets]
}

// By node type, since `instanceof ShadowRoot` is false for one from another document's window.
const isShadowRoot = (node: Node): node is ShadowRoot =>
  node.nodeType === 11 && "host" in node

// The document's constructed sheet with the rules, made with its own window's
// constructor. None for a document without a window, which renders nothing.
function sharedSheet(doc: Document) {
  const view = doc.defaultView
  if (!view) {
    return
  }
  let entry = constructed.get(doc)
  if (!entry) {
    constructed.set(
      doc,
      (entry = { sheet: new view.CSSStyleSheet(), version: -1 })
    )
  }
  // Rules defined since it was made.
  if (entry.version !== rulesVersion) {
    entry.sheet.replaceSync(rules())
    entry.version = rulesVersion
  }
  return entry.sheet
}

// The element's document gets the rules, and any defined since they were
// copied: another document an element moves into, like an iframe's, and this
// one again after the page replaces its adopted sheets, which take them when
// the page's csp-nonce tag has no nonce. Unchanged, it's one lookup.
function copyStyles(doc: Document) {
  if (css) {
    writeStyle(doc, documentStyle(), css)
  }
}

type Part = {
  slot: string
  // The feature that ships the slot, which the owner's instance uses before it reads it.
  feature?: Feature
  // The element the slot binds to. A trigger binds to the button inside it.
  el: HTMLElement
  props: Record<string, unknown>
  unbind?: () => void
  // Marks where a portaled element came from, so it can go back.
  placeholder?: Comment
  // Undoes `connect`, which runs while the part is in the page, present or not.
  disconnect?: () => void
  // Its subscription to the instance, the record and the values it selects
  // on that it depends on, and the version it last synced at.
  unwatch?: () => void
  record?: InstancePart
  selected?: string
  version?: number
  // Whether it was present when it last synced.
  shown?: boolean
  // The `data-slot` it last wrote, which a part around it on the same element writes too.
  dataSlot?: string
  // Syncs it again through its owner, once a part on the same element lets go.
  sync?: () => void
  // Reads its props again, for parts whose props come from their surroundings.
  reread?: () => Record<string, unknown>
  keyed?: boolean
  // Watches a native child's attributes that its props follow.
  observer?: MutationObserver
}

// Owners whose options come from their surroundings, like a toggle's toolbar
// group. A change to an element around one configures it again.
const dependents = new Set<HTMLElement & { reconfigure: () => void }>()

function reconfigureInside(el: HTMLElement) {
  for (const dependent of dependents) {
    if (dependent !== el && el.contains(dependent)) {
      dependent.reconfigure()
    }
  }
}

type OwnerElement = HTMLElement & {
  register: (part: Part) => void
  unregister: (part: Part) => void
  update: (part: Part, rebind: boolean) => void
  rebind: () => void
}

// Where portaled parts went, so popups inside them can follow.
const portals = new WeakMap<Element, Element | DocumentFragment>()

// Containers that pass on what they'd hand down: a popup inside a sheet
// renders where the sheet's viewport went, never into the viewport itself.
const passedOn = new WeakMap<
  Element | DocumentFragment,
  Element | DocumentFragment | null
>()

/** Popups inside `container` inherit `to` instead, or render in place for null. */
function passPortalOn(
  container: Element,
  to: Element | DocumentFragment | null
) {
  passedOn.set(container, to)
}

/**
 * The container the nearest portaled part above `el` renders into. A popup
 * inside a portaled popup renders there too, unless it names its own.
 */
function inheritedPortal(el: Element) {
  for (
    let node: Element | null = el.parentElement;
    node;
    node = node.parentElement
  ) {
    const target = portals.get(node)
    if (target) {
      return passedOn.has(target) ? passedOn.get(target)! : target
    }
  }
  return null
}

// The part elements each owner has registered, so nested lookups work after a
// popup moves to a portal.
const partOwners = new WeakMap<Element, OwnerElement>()

// Each part element's part, so a part inside it can take its props.
const slotParts = new WeakMap<Element, Part>()

// Another component's part between `part`'s own element and the element both
// bind, like a number input's control inside a toolbar input. Its `data-slot`
// wins, as the element passed to `render` wins in the other frameworks.
function innerPart(part: Part, owner: HTMLElement) {
  for (
    let node: HTMLElement | null = part.el;
    node && node !== owner;
    node = node.parentElement
  ) {
    const other = slotParts.get(node)
    if (other === part) {
      return
    }
    if (other?.el === part.el && registered.has(other)) {
      return other
    }
  }
}

// Each owner on a shared element writes the inner part's `data-slot`, and takes
// the other's for what it found there. Once a part lets go, the slot is
// forgotten, and the parts still bound write their own again.
function handOver(part: Part) {
  part.dataSlot = undefined
  const sharing: Part[] = []
  for (
    let node: HTMLElement | null = part.el;
    node;
    node = node.parentElement
  ) {
    const other = slotParts.get(node)
    if (
      other &&
      other !== part &&
      other.el === part.el &&
      registered.has(other)
    ) {
      sharing.push(other)
    }
  }
  if (!sharing.length) {
    return
  }
  part.el.removeAttribute("data-slot")
  markAuthored(part.el, "data-slot")
  for (const other of sharing) {
    other.sync?.()
  }
}

// A part its owner let go of when it left the page registers again once the owner is back.
const registered = new WeakSet<Part>()

// Looks for the part element's owner again, for an owner that connects after
// a part whose `for` names it, like a native label's control.
const findOwnerAgain = new WeakMap<Element, () => void>()

type ListApi = { internal: { keyOf: (value: unknown) => string } }

const hasRichValue = (props: Record<string, unknown>) =>
  props.value !== undefined && typeof props.value !== "string"

// The props of the nearest part of `slot` around `el` that has the same owner,
// so a part of another component in between, with a slot of the same name, is skipped.
function propsAround(el: Element, slot: string, owner?: OwnerElement) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const part = slotParts.get(node)
    if (part?.slot !== slot || partOwners.get(node) !== owner) {
      continue
    }
    // An item gives the parts inside it its key as its value, as in the other frameworks.
    return part.keyed && hasRichValue(part.props)
      ? { ...part.props, value: part.props.id }
      : part.props
  }
}

/**
 * The nearest owner above `el`, or the owner of the nearest part above it.
 * Popups may have moved to a portal, so the DOM alone can't answer. A part with
 * `for="id"` names its owner anywhere on the page, like a trigger in a table row.
 * Parts of other components in between are skipped, like a popover trigger
 * inside a tooltip trigger.
 */
function findOwner(el: Element, selector: string) {
  const target = el.getAttribute("for")
  if (target) {
    // Looked up in the element's own tree, like a native `for`, so it works in a shadow root.
    const root = el.getRootNode() as Document | ShadowRoot
    const owner = "getElementById" in root ? root.getElementById(target) : null
    if (owner?.matches(selector)) {
      return owner as OwnerElement
    }
  }
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (node.matches(selector)) {
      return node as OwnerElement
    }
    // A part of another kind of owner, like a field's label inside a number
    // field's scrub area, keeps looking past that owner's parts.
    const owner = partOwners.get(node)
    if (owner?.matches(selector)) {
      return owner
    }
  }
}

// The selector each element last warned about, so a sync on every change warns once.
const unmatched = new WeakMap<Element, string>()

/**
 * The element `selector` matches, like a popup's `container="#id"`. Looked up
 * in the element's own tree first, like `for`, then in each tree around it up
 * to the document, so a popup in a shadow root can name a container outside it.
 */
function findContainer(el: Element, selector: string) {
  for (let root = el.getRootNode(); ; root = root.host.getRootNode()) {
    const container = (root as ParentNode).querySelector(selector)
    if (container) {
      return container
    }
    if (!isShadowRoot(root)) {
      break
    }
  }
  if (unmatched.get(el) !== selector) {
    warn(
      `<${el.localName}> container="${selector}" matches no element yet, so it renders in place. A container rendered later is used from its next open.`
    )
  }
  unmatched.set(el, selector)
  return null
}

// Runs after the current task's moves settle. A popup moving to a portal
// disconnects and reconnects in the same task, and must stay bound.
function whenGone(el: HTMLElement, run: () => void) {
  queueMicrotask(() => {
    if (!el.isConnected) {
      run()
    }
  })
}

// What each form-associated element would save with its value, for a
// reconnect to restore.
const formStates = new WeakMap<HTMLElement, () => string>()

// Binds an element's internals, keeping how to read its state.
const bindInternals: typeof bindElementInternals = (el, internals, options) => {
  formStates.set(el, options.state)
  return bindElementInternals(el, internals, options)
}

// A form-associated base class: the element takes part in forms like a native
// control, through ElementInternals. The core reports its value and validity,
// and hears about resets, disabling fieldsets and restored state. It has the
// members native controls have, so form code treats it like one.
function formAssociated(Base: typeof HTMLElement) {
  return class extends Base {
    static formAssociated = true
    #internals: ElementInternals
    constructor() {
      super()
      this.#internals = this.attachInternals()
      attachFormInternals(this, this.#internals, bindInternals)
    }
    get form() {
      return this.#internals.form
    }
    get labels() {
      return this.#internals.labels
    }
    get name() {
      return this.getAttribute("name") ?? ""
    }
    set name(value: string) {
      this.setAttribute("name", value)
    }
    get validity() {
      return this.#internals.validity
    }
    get validationMessage() {
      return this.#internals.validationMessage
    }
    get willValidate() {
      return this.#internals.willValidate
    }
    checkValidity() {
      return this.#internals.checkValidity()
    }
    reportValidity() {
      return this.#internals.reportValidity()
    }
    setCustomValidity(message: string) {
      if (!formCallback(this, "customValidity", message)) {
        this.#internals.setValidity(
          message ? { customError: true } : {},
          message
        )
      }
    }
    formResetCallback() {
      pendingRestores.delete(this)
      formCallback(this, "reset")
    }
    formDisabledCallback(disabled: boolean) {
      formCallback(this, "disabled", disabled)
    }
    formStateRestoreCallback(state: unknown, mode: string) {
      pendingRestores.delete(this)
      // The browser restores state as the element upgrades, before its parts bind.
      if (!restoreQuietly(this, state, mode)) {
        restoreOnceBound(this, state, mode)
      }
    }
  }
}

// How `defineRootElement` defines an owner element, from what `createParts` reads.
type OwnerConfig<P extends Primitive> = {
  /**
   * Attributes, by option name in camelCase. Each is read from its kebab-case
   * attribute, observed, and parsed by its type. `debug` is always there.
   */
  attributes?: Record<string, AttributeType>
  /** Options that don't come from attributes, like a group found in the page. */
  options?: (el: HTMLElement) => Partial<OptionsOf<P>>
  /**
   * Live properties for the state a user controls, like `open` or `value`.
   * Setting one changes the state as a controller would, and fires the
   * change event. An attribute of the same name sets the starting state, and
   * changing it later changes the state the same way.
   */
  state?: Record<
    string,
    { get: (api: any) => unknown; set: (api: any, value: any) => void }
  >
  /** The controller's methods, which the element's `api` property exposes. */
  api?: string[]
  /** Callbacks that fire no event, because part elements already report them. */
  silent?: string[]
  /** Callbacks whose event hands listeners `waitUntil()`, from the schema's `"action"` kind. */
  actions?: string[]
  /**
   * Event names for callbacks whose own name a native event that bubbles in
   * already takes, like `{ onSelect: "itemselect" }` beside a text field's `select`.
   */
  events?: Record<string, string>
  /**
   * Runs once the instance exists, and again when a property is set, with
   * the element and its instance, which only this hook sees. Data elements
   * render their parts here. A returned cleanup runs before the next render
   * and once the element is gone, like a store subscription's.
   */
  render?: (el: HTMLElement, instance: ReturnType<P>) => void | (() => void)
  /**
   * Attributes for the element itself, like role="none" on wrappers that
   * must not split a list for assistive technology.
   */
  host?: Record<string, string>
  /** The element's CSS display. `contents` keeps it out of layout, for wrappers. Inline by default. */
  display?: PartDisplay
  /** The slot the element itself fills, like the root of a tabs widget. */
  self?: string
  /**
   * Native elements inside it that fill slots, like the <fieldset> inside
   * <ui-field-set>. They keep their native behavior, which a custom element can't
   * have, like a fieldset disabling the controls inside it. A missing one
   * warns, unless its slot is in `optionalChildren`, like a fieldset's legend.
   */
  children?: Record<string, (el: HTMLElement) => HTMLElement | null>
  /**
   * The element the `self` slot binds to, when it isn't the element itself,
   * like the <button> inside <ui-button>, so native button behavior stays.
   */
  target?: (el: HTMLElement) => HTMLElement | null
  /** Slots in `children` that may be missing without a warning, like a fieldset's legend. */
  optionalChildren?: string[]
  /**
   * The native children's attributes that props or options follow, like an
   * <input>'s `disabled`, `readonly` and `required`, or its `autocomplete`.
   * A change reads `read` and the options again.
   */
  childProps?: {
    attributes: string[]
    read?: (el: HTMLElement) => Record<string, unknown>
  }
  /**
   * Slots that move into a container while present, like popups. Without
   * top layer support they move to the body. The container is asked on
   * every sync, with the part, so a part can move while bound, like a
   * navigation menu's content into its viewport as it opens.
   */
  portal?: {
    slots: string[]
    container: (
      el: HTMLElement,
      part: { slot: string; el: HTMLElement; props: Record<string, unknown> }
    ) => Element | DocumentFragment | null
  }
  /**
   * Properties, like a data menu's items or a `controller`. Each one set goes
   * into the options, and setting one updates them and renders again.
   */
  properties?: string[]
  /** Takes part in forms like a native control, like <ui-checkbox name="terms">. */
  formAssociated?: boolean
  /**
   * Boolean options that start on, like `{ loop: true }`, so their
   * properties read true without the attribute and `false` writes "false".
   * A function decides from the element, like `closeOnOutsidePress` from `modal`.
   */
  defaults?: Partial<
    Record<keyof OptionsOf<P> & string, BooleanDefaults[string]>
  >
}

// The option that sets where a state key starts, like `defaultChecked` for `checked`.
const defaultOf = (name: string) =>
  `default${name[0].toUpperCase()}${name.slice(1)}`

// Defines the element that owns a primitive instance, like <ui-menu>. Part
// elements inside it register themselves with it. Attributes become options,
// `state` adds live properties that fire `<name>change` events, and `api`
// exposes the controller's methods on the element's `api` property. Does
// nothing on the server, and once per tag.
function defineRootElement<P extends Primitive>(
  tagName: string,
  primitive: P,
  config: OwnerConfig<P>
) {
  if (!claimTag(tagName)) {
    return
  }
  setDisplay(tagName, config.display)
  const schema: Record<string, AttributeType> = {
    debug: "boolean",
    ...config.attributes,
  }
  const state = config.state ?? {}
  // Options from attributes and properties. A state attribute, like `open`,
  // sets where the state starts, unless its `default-` attribute does.
  const optionsOf = (
    el: HTMLElement,
    properties: Record<string, unknown>,
    rendered: Set<string>
  ) => {
    const options = readAttributes(el, schema)
    for (const name of rendered) {
      delete options[name]
    }
    for (const [name, value] of Object.entries(properties)) {
      if (value !== undefined) {
        options[name] = value
      }
    }
    for (const name of Object.keys(state)) {
      if (!(name in options)) {
        continue
      }
      const fallback = defaultOf(name)
      if (!(fallback in options)) {
        options[fallback] = options[name]
      }
      delete options[name]
    }
    return { ...options, ...config.options?.(el) } as Partial<OptionsOf<P>>
  }
  customElements.define(
    tagName,
    class Owner extends (config.formAssociated
      ? formAssociated(HTMLElement)
      : HTMLElement) {
      static observedAttributes = [
        ...Object.keys(schema).map(kebab),
        ...semantics,
      ]
      #view?: object
      get #instance() {
        return instances.get(this) as ReturnType<P> | undefined
      }
      // The controller's methods. Internals stay out of reach.
      get api() {
        if (!this.#instance) {
          return undefined
        }
        return (this.#view ??= controllerView(
          this,
          this.#instance.api as object,
          config.api ?? []
        ))
      }
      #parts = new Set<Part>()
      #pending = new Set<Part>()
      #connected = false
      #rendering = false
      #rendered = new Set<string>()
      #applying = new Set<Part>()
      #stale = new Set<Part>()
      // Left the page and destroyed its instance, which a reconnect replaces.
      #gone = false
      #properties: Record<string, unknown> = {}
      // State properties set while there's no live instance, like before the
      // element connects, where the next instance starts.
      #state: Record<string, unknown> = {}
      // What a form-associated element reported to its form when it left,
      // which it restores when it's back.
      #saved?: string

      static {
        for (const [name, { get, set }] of Object.entries(state)) {
          Object.defineProperty(Owner.prototype, name, {
            get(this: Owner) {
              if (name in this.#state) {
                return this.#state[name]
              }
              return this.#instance ? get(this.#instance.api) : undefined
            },
            set(this: Owner, value: unknown) {
              wroteFromScript(this)
              if (this.#instance && !this.#gone) {
                this.#quietly(() => set(this.#instance!.api, value))
              } else {
                this.#state[name] = value
              }
            },
          })
        }
        for (const name of config.properties ?? []) {
          Object.defineProperty(Owner.prototype, name, {
            get(this: Owner) {
              return this.#properties[name]
            },
            set(this: Owner, value: unknown) {
              // A page that renders on every change, like lit-html, sets the same value again each time.
              if (Object.is(this.#properties[name], value)) {
                return
              }
              this.#properties[name] = value
              if (!this.#connected) {
                return
              }
              this.#configure()
              this.#render()
            },
          })
        }
        reflectAttributes(
          Owner.prototype,
          schema,
          config.defaults as BooleanDefaults
        )
      }

      // Options come from attributes and properties, with `defaults` over them.
      // Re-read them into the instance.
      #configure(defaults?: Record<string, unknown>) {
        this.#instance?.setOptions(
          withEvents(
            this,
            {
              ...optionsOf(this, this.#properties, this.#rendered),
              ...defaults,
              id: this.#instance.id,
            },
            config.silent,
            config.actions,
            config.events
          )
        )
      }

      attributeChangedCallback(
        name: string,
        previous: string | null,
        value: string | null
      ) {
        markAuthored(this, name)
        if (semantics.includes(name)) {
          return
        }
        const key = name.replace(/-(\w)/g, (_, char: string) =>
          char.toUpperCase()
        )
        if (key in state && value !== previous && !this.#rendering) {
          wroteFromScript(this)
        }
        if (!this.#rendering || value === null) {
          this.#rendered.delete(key)
        } else if (previous === null) {
          this.#rendered.add(key)
        }
        if (!this.#connected) {
          return
        }
        this.#configure()
        reconfigureInside(this)
        // A state attribute changed after the start, like `value` set from the
        // URL. Removing it clears the state, like removing `open` from <details>.
        if (!(key in state) || value === previous) {
          return
        }
        const type = schema[key]
        const cleared = type === "boolean" ? false : type === "list" ? [] : null
        this.#quietly(() =>
          state[key].set(
            this.#instance!.api,
            value === null ? cleared : parseAttribute(type, value)
          )
        )
      }

      // State set from script commits without events, like a native input's
      // `value`, so a page that renders the state back never hears its own write.
      #quietly(write: () => void) {
        const nested = quiet.has(this)
        quiet.add(this)
        try {
          writeFromScript(this, write)
        } finally {
          // Fields read validity again on `input` and `change`, which this
          // write doesn't fire, even when a page callback inside it threw.
          if (!nested) {
            quiet.delete(this)
            validityChanged(this)
          }
        }
      }

      connectedCallback() {
        // Even a move within one task can take it into a shadow root or another document.
        adoptStyles(this)
        if (this.#connected) {
          for (const part of this.#parts) {
            elementMoved(part.el)
          }
          // Options from its surroundings, like a disabled field around it, may differ where it landed.
          if (config.options) {
            this.#configure()
          }
          return
        }
        upgradeProperties(this, [
          ...Object.keys(state),
          ...(config.properties ?? []),
          ...Object.keys(schema),
        ])
        for (const [name, value] of Object.entries(config.host ?? {})) {
          if (!this.hasAttribute(name)) {
            this.setAttribute(name, value)
          }
        }
        // Put back after it left the page, like a view a router kept: its
        // instance was destroyed, so a new one starts where the old one was,
        // the way a native element keeps its state. A form-associated one
        // starts from its defaults, which a form reset returns to, and
        // restores its state as the browser would.
        const restore =
          this.#gone && !Object.keys(this.#state).length
            ? this.#saved
            : undefined
        const starts: Record<string, unknown> = {}
        if (this.#gone && restore === undefined) {
          for (const [name, { get }] of Object.entries(state)) {
            starts[name] = get(this.#instance!.api)
          }
        }
        // A state property set while it was away, or before it connected, wins.
        Object.assign(starts, this.#state)
        this.#state = {}
        const last = Object.fromEntries(
          Object.entries(starts).map(([name, value]) => [
            defaultOf(name),
            value,
          ])
        )
        if (this.#gone) {
          instances.delete(this)
          this.#view = undefined
          this.#gone = false
          this.#saved = undefined
        }
        // Attributes may have changed while it was disconnected.
        let instance = this.#instance
        if (instance) {
          this.#configure()
        } else {
          instance = primitive(
            withEvents(
              this,
              {
                ...optionsOf(this, this.#properties, this.#rendered),
                ...last,
                id:
                  this.id || `ui-sdk-${tagName.replace(/^ui-/, "")}-${++count}`,
              },
              config.silent,
              config.actions,
              config.events
            )
          ) as ReturnType<P>
          instances.set(this, instance)
        }
        // A form reset returns to the defaults the attributes give, not to
        // where properties set before connecting started it, like a native input.
        if (config.formAssociated && Object.keys(starts).length) {
          const base = instance.startState(
            optionsOf(this, this.#properties, this.#rendered)
          ) as Record<string, unknown>
          this.#configure(
            Object.fromEntries(
              Object.keys(starts).map((name) => [defaultOf(name), base[name]])
            )
          )
        }
        this.#connected = true
        if (config.options) {
          dependents.add(this)
        }
        if (config.self) {
          const el = boundElement(this, config.target)
          if (el) {
            this.#registerSelf(el)
          } else {
            warn(`<${tagName}> needs an element inside it.`)
          }
        }
        for (const [slot, find] of Object.entries(config.children ?? {})) {
          const child = find(this)
          if (child) {
            this.#registerChild(slot, child)
          } else if (!config.optionalChildren?.includes(slot)) {
            warn(
              `<${tagName}> needs its native element inside it for "${slot}".`
            )
          }
        }
        // Native children can come and go, like an avatar's <img> added once a
        // URL is known, and so can the element the own slot binds, like the
        // <button> inside <ui-button>.
        if (config.children || config.target) {
          this.#childObserver = new MutationObserver(() => {
            this.#syncChildren()
            this.#syncSelf()
          })
          this.#childObserver.observe(this, { childList: true })
        }
        this.#render()
        if (this.id) {
          const root = this.getRootNode() as ParentNode
          for (const el of root.querySelectorAll(
            `[for="${CSS.escape(this.id)}"]`
          )) {
            findOwnerAgain.get(el)?.()
          }
        }
        // Once its parts bind, which reports to the form again, silently.
        if (restore !== undefined) {
          restoreOnceBound(this, restore, "restore")
        }
      }

      #renderCleanup?: () => void

      // Runs only while connected, when the instance exists.
      #render() {
        this.#renderCleanup?.()
        this.#renderCleanup =
          config.render?.(this, this.#instance!) || undefined
      }

      reconfigure() {
        if (this.#connected) {
          this.#configure()
        }
      }

      #childParts = new Map<string, Part>()
      #childObserver?: MutationObserver
      #selfPart?: Part

      #registerSelf(el: HTMLElement) {
        this.#selfPart = { slot: config.self!, el, props: {} }
        this.register(this.#selfPart)
      }

      // The element the own slot binds was replaced: the new one binds instead.
      #syncSelf() {
        if (!config.self || !config.target) {
          return
        }
        const el = boundElement(this, config.target)
        if (el === this.#selfPart?.el) {
          return
        }
        if (this.#selfPart) {
          this.unregister(this.#selfPart)
        }
        this.#selfPart = undefined
        // Options can come from the element, like a button's authored `type`.
        this.#configure()
        if (el) {
          this.#registerSelf(el)
        }
      }

      #registerChild(slot: string, el: HTMLElement) {
        const part: Part = {
          slot,
          el,
          props: config.childProps?.read?.(el) ?? {},
        }
        if (config.childProps) {
          part.observer = new MutationObserver(() => {
            part.props = config.childProps!.read?.(el) ?? {}
            this.#configure()
            this.update(part, false)
          })
          part.observer.observe(el, {
            attributeFilter: config.childProps.attributes,
          })
        }
        this.#childParts.set(slot, part)
        this.register(part)
      }

      #syncChildren() {
        for (const [slot, find] of Object.entries(config.children ?? {})) {
          const child = find(this)
          const current = this.#childParts.get(slot)
          if (current?.el === child) {
            continue
          }
          if (current) {
            this.unregister(current)
            this.#childParts.delete(slot)
          }
          if (child) {
            this.#registerChild(slot, child)
          }
        }
      }

      disconnectedCallback() {
        // Moved in one go, like into a portal, it stays. Gone, it settles a
        // pending controller `open()` and lets go of its controller, and put
        // back later, it starts again where it was.
        whenGone(this, () => {
          this.#saved = formStates.get(this)?.()
          this.#renderCleanup?.()
          this.#renderCleanup = undefined
          this.#childObserver?.disconnect()
          this.#childObserver = undefined
          this.#childParts.clear()
          this.#selfPart = undefined
          this.#connected = false
          dependents.delete(this)
          for (const part of this.#parts) {
            this.unregister(part)
          }
          this.#instance?.destroy()
          this.#gone = true
        })
      }

      // Parts register as they upgrade, in no useful order. They sync together a
      // microtask later in DOM order, so a trigger binds before an open popup.
      register(part: Part) {
        this.#parts.add(part)
        registered.add(part)
        part.sync = () => this.#pending.has(part) || this.#sync(part)
        if (!this.#pending.size) {
          queueMicrotask(() => this.#flush())
        }
        this.#pending.add(part)
      }

      #flush() {
        const parts = inDocumentOrder([...this.#pending])
        this.#pending.clear()
        for (const part of parts) {
          if (!this.#parts.has(part)) {
            continue
          }
          // Props from the parts around it, like an item's group, are read
          // again, in document order, since those may have upgraded after it.
          if (part.reread) {
            part.props = part.reread()
          }
          if (part.feature) {
            this.#instance!.use(part.feature)
          }
          this.#watch(part)
          this.#sync(part)
        }
      }

      // Syncs a part again when a change can affect it, so a highlight change
      // reaches the two items it moves between, not every part. Live state is
      // written by the core, so only changes to state that affects rendering
      // apply attributes again. A part that selects on a live key, like an
      // item on the highlight, hears that key alone, and has nothing to apply.
      #watch(part: Part) {
        const instance = this.#instance!
        part.unwatch?.()
        const record = instance.part(part.slot, part.props)
        part.record = record
        part.selected = selectedKeys(record)
        part.version = renderVersion(instance)
        part.unwatch = subscribe(record, (liveOnly) => {
          // Presence may read live state, so it is checked on every change.
          if (isPresent(record) !== part.shown) {
            part.version = renderVersion(instance)
            return this.#sync(part)
          }
          if (liveOnly) {
            return
          }
          const version = renderVersion(instance)
          if (version === part.version) {
            return
          }
          part.version = version
          this.#sync(part)
        })
      }

      unregister(part: Part) {
        part.unwatch?.()
        part.unwatch = undefined
        part.observer?.disconnect()
        part.observer = undefined
        this.#unbind(part)
        // An element the part lets go of, like a button moved out of a tab, keeps
        // nothing the owner wrote, and gets back what the owner wrote over.
        releaseAttrs(part.el, this.#channel)
        part.disconnect?.()
        part.disconnect = undefined
        this.#restore(part)
        this.#parts.delete(part)
        registered.delete(part)
        this.#pending.delete(part)
        handOver(part)
      }

      // Binds every bound part again, in DOM order, for what they found when
      // they bound, like the menubar a menu joins, which may upgrade later.
      rebind() {
        const parts = inDocumentOrder(
          [...this.#parts].filter((part) => !this.#pending.has(part))
        )
        for (const part of parts) {
          this.#unbind(part)
        }
        for (const part of parts) {
          this.#sync(part)
        }
      }

      // Props changed. A new key needs a new binding. Other parts can depend on
      // this one's props, like radio items on their group's value, or on its
      // attributes, like toolbar items on their group's `disabled`, so they
      // read their props again and sync too.
      update(part: Part, rebind: boolean) {
        if (this.#pending.has(part)) {
          return
        }
        this.#rewatch(part, rebind)
        this.#sync(part)
        for (const other of this.#parts) {
          if (other === part || this.#pending.has(other)) {
            continue
          }
          if (other.reread) {
            const previous = other.props
            other.props = other.reread()
            this.#rewatch(other, rekeyed(previous, other.props))
          }
          this.#sync(other)
        }
        reconfigureInside(part.el)
      }

      #rewatch(part: Part, rebind: boolean) {
        if (rebind) {
          this.#unbind(part)
        }
        const record = this.#instance!.part(part.slot, part.props)
        if (record !== part.record || selectedKeys(record) !== part.selected) {
          this.#watch(part)
        }
      }

      #sync(part: Part) {
        // A write can change state as it lands, like the `disabled` a form-associated
        // element hears it lost, so the part syncs again after it, never in the middle.
        if (this.#applying.has(part)) {
          return void this.#stale.add(part)
        }
        adoptStyles(part.el)
        const instance = this.#instance!
        const record = instance.part(part.slot, part.props)
        // A part stays in the page while it isn't present, like a closed popup's content.
        part.disconnect ??= connect(record, part.el)
        part.shown = isPresent(record)
        if (part.shown) {
          // A part that moves unbinds first, and binds again where it lands.
          const target = this.#portalTarget(part)
          if (target !== undefined && this.#moves(part, target)) {
            this.#unbind(part)
            this.#move(part, target)
          }
          // A part whose visibility the primitive controls owns its `hidden`, so one
          // the server wrote goes when it shows. An author's own on any other part stays.
          const attrs = partAttrs(record)
          if (
            attrs.hidden === undefined &&
            (conditional(record) || "hidden" in attrs)
          ) {
            part.el.removeAttribute("hidden")
          }
          this.#apply(part, attrs)
          if (!part.unbind) {
            this.#bind(part, record)
          }
        } else {
          // A part that was shown gets its final attributes first, so it never keeps
          // stale state like data-open. Parts never shown stay untouched.
          if (part.unbind) {
            this.#apply(part, partAttrs(record))
            this.#unbind(part)
          }
          if (!part.el.hasAttribute("hidden")) {
            part.el.setAttribute("hidden", "")
          }
          // The rule that keeps hidden parts hidden over an author's display
          // classes matches `data-slot`, which a part never shown has no other way to get.
          const slot = partAttrs(record)["data-slot"]
          if (slot && !part.el.hasAttribute("data-slot")) {
            part.el.setAttribute("data-slot", slot)
          }
          this.#restore(part)
        }
      }

      // Binding and unbinding can change state, which syncs parts again. The part
      // counts as bound from the start, so a nested sync never binds it twice,
      // and as unbound from the start, so it never unbinds twice.
      #bind(part: Part, record: InstancePart) {
        let cleanup: (() => void) | undefined
        let unbound = false
        part.unbind = () => {
          unbound = true
          cleanup?.()
        }
        cleanup = bind(record, part.el)
        if (unbound) {
          cleanup()
        }
      }

      #unbind(part: Part) {
        const unbind = part.unbind
        part.unbind = undefined
        unbind?.()
      }

      // Where a portaled slot's part belongs: a container, or null for in
      // place. Undefined for slots that never move.
      #portalTarget(part: Part) {
        if (!config.portal?.slots.includes(part.slot)) {
          return undefined
        }
        return portalTarget(config.portal.container(this, part))
      }

      #moves(part: Part, target: Element | DocumentFragment | null) {
        return target ? part.el.parentNode !== target : !!part.placeholder
      }

      // Moves a part into its container, or back in place for null.
      #move(part: Part, target: Element | DocumentFragment | null) {
        this.#restore(part)
        if (!target) {
          return
        }
        part.placeholder = document.createComment(`${tagName} ${part.slot}`)
        part.el.replaceWith(part.placeholder)
        target.appendChild(part.el)
        portals.set(part.el, target)
      }

      // An attribute the owner writes on itself is state, not an option, like a
      // grouped checkbox's `disabled` from its group, so it never disables it for good.
      #apply(part: Part, attrs: Record<string, string | undefined>) {
        const inner = innerPart(part, this)
        if (inner?.dataSlot) {
          attrs = { ...attrs, "data-slot": inner.dataSlot }
        }
        part.dataSlot = attrs["data-slot"]
        const rendering = this.#rendering
        this.#rendering = part.el === this
        this.#applying.add(part)
        try {
          applyAttrs(part.el, attrs, this.#channel)
        } finally {
          this.#rendering = rendering
          this.#applying.delete(part)
        }
        if (this.#stale.delete(part)) {
          this.#sync(part)
        }
      }

      // What the owner writes on its parts' elements. By host, not instance, so
      // one put back on the page replaces what its last instance wrote, like its parts' ids.
      get #channel() {
        return `render:${autoId(this)}`
      }

      #restore(part: Part) {
        if (!part.placeholder) {
          return
        }
        part.placeholder.replaceWith(part.el)
        part.placeholder = undefined
        portals.delete(part.el)
      }
    }
  )
}

// How `definePartElement` defines a part element, from what `createParts` reads.
type SlotConfig = {
  /** The owner primitive's slot this element fills. */
  slot: string
  /** Owner elements this part can belong to. */
  owner: string
  /** Attributes read as props, by name in camelCase, each with its type. */
  props?: Record<string, AttributeType>
  /** Props that come from the surroundings, like the group a radio item is in. */
  context?: (el: HTMLElement) => Record<string, unknown>
  /**
   * Props that, left out, come from a prop of the nearest part around it of
   * the slot named, like a handle's `value` from its item's.
   */
  from?: Record<string, { slot: string; prop: string }>
  /** Props made unique for each element, like an icon's `id`. */
  ids?: string[]
  /**
   * The element the slot binds to, when it isn't the part itself. Without it,
   * an as-child attribute binds the part's first child instead, like a link.
   */
  target?: (el: HTMLElement) => HTMLElement | null
  /** Runs once before the first registration, to add generated children. */
  render?: (el: HTMLElement) => void
  /** Runs when one of its `props` attributes changes, for generated children that follow it. */
  changed?: (el: HTMLElement) => void
  /** The element's CSS display. `contents` keeps it out of layout, for wrappers. Inline by default. */
  display?: PartDisplay
  /** Form-associated, so labels and fieldsets treat it like a native control. */
  formAssociated?: boolean
  /** Properties read as props, like a trigger's `payload`. Setting one re-syncs the part. */
  properties?: string[]
  /** Boolean props that start on, like `{ closeOnSelect: true }`, as the owner's `defaults`. */
  defaults?: BooleanDefaults
  /** Props the part's core binding reads once, so a change binds it again. */
  rebind?: string[]
  /** @internal The feature that ships the slot, like a select's select-all option. */
  feature?: Feature
  /**
   * @internal Runs on the element the part binds when no owner is around it,
   * in place of the warning that it needs one, for a part that works alone,
   * like a field label wrapping a whole field. It gets the bound element and
   * the part element, which holds the attributes, and runs again when they change.
   */
  alone?: (el: HTMLElement, host: HTMLElement) => void
  /** Callbacks whose event hands listeners `waitUntil()`, from the schema's `"action"` kind. */
  actions?: string[]
  /** Whether its `value` keys it, like a list item's, from the schema's `"key"` kind. */
  keyed?: boolean
}

// Defines a part element, like <ui-menu-item>. It finds its owner, reads its
// props from attributes and registers. The owner binds and syncs it.
function definePartElement(tagName: string, config: SlotConfig) {
  if (!claimTag(tagName)) {
    return
  }
  const schema = config.props ?? {}
  setDisplay(tagName, config.display, "align" in schema)

  customElements.define(
    tagName,
    class PartElement extends (config.formAssociated
      ? formAssociated(HTMLElement)
      : HTMLElement) {
      static observedAttributes = [
        ...Object.keys(schema).map(kebab),
        "for",
        ...semantics,
      ]
      #owner?: OwnerElement
      #part?: Part
      #properties: Record<string, unknown> = {}

      constructor() {
        super()
        findOwnerAgain.set(this, () => {
          if (this.isConnected) {
            this.connectedCallback()
          }
        })
      }

      static {
        for (const name of config.properties ?? []) {
          Object.defineProperty(PartElement.prototype, name, {
            get(this: PartElement) {
              return (
                this.#properties[name] ??
                (schema[name] && readAttribute(this, name, schema[name]))
              )
            },
            set(this: PartElement, value: unknown) {
              this.#properties[name] = value
              this.attributeChangedCallback("")
            },
          })
        }
        reflectAttributes(PartElement.prototype, schema, config.defaults)
      }

      // What the element says itself, its attributes and properties, wins
      // over what its surroundings give it.
      #props() {
        const props: Record<string, unknown> = {
          ...config.context?.(this),
          ...readAttributes(this, schema),
        }
        for (const name of config.properties ?? []) {
          if (this.#properties[name] !== undefined) {
            props[name] = this.#properties[name]
          }
        }
        for (const [name, { slot, prop }] of Object.entries(
          config.from ?? {}
        )) {
          props[name] ??= propsAround(this, slot, this.#owner)?.[prop]
        }
        for (const name of config.ids ?? []) {
          props[name] ??= autoId(this)
        }
        // Parts without a value, their own or from their surroundings, still need a stable key.
        if (props.value === undefined && props.id === undefined) {
          props.id = autoId(this)
        }
        // The core keys a part by `String(value)`, so a rich value takes its list's key.
        if (config.keyed && hasRichValue(props)) {
          props.id ??= instanceOf<ListApi>(this.#owner)?.api.internal.keyOf(
            props.value
          )
        }
        return withEvents(this, props, [], config.actions)
      }

      // Watches the children for the element the part binds, which can come
      // later or be replaced, like a framework's conditional content.
      #children?: MutationObserver

      connectedCallback() {
        upgradeProperties(this, [
          ...(config.properties ?? []),
          ...Object.keys(schema),
        ])
        adoptStyles(this)
        if (
          (config.target || this.hasAttribute("as-child")) &&
          !this.#children
        ) {
          this.#children = new MutationObserver(() => this.#retarget())
          this.#children.observe(this, { childList: true })
        }
        const owner = findOwner(this, config.owner) ?? this.#owner
        if (!owner) {
          return queueMicrotask(() => this.#findOwnerLater())
        }
        // Upgrade order can reach a part before its owner. Try again once it's defined.
        if (!("register" in owner)) {
          customElements
            .whenDefined((owner as HTMLElement).localName)
            .then(() => this.isConnected && this.connectedCallback())
          return
        }
        if (owner === this.#owner && this.#part && registered.has(this.#part)) {
          return
        }
        if (this.#owner && this.#part) {
          this.#owner.unregister(this.#part)
        }

        const el = boundElement(this, config.target)
        // It may come later. Warned once the task that built the element ends without it.
        if (!el) {
          return queueMicrotask(() => {
            if (
              this.isConnected &&
              !this.#part &&
              !boundElement(this, config.target)
            ) {
              warn(`<${tagName}> needs an element inside it.`)
            }
          })
        }
        if (!this.#part) {
          config.render?.(this)
          // A render that moves the part, like into a wrapper it adds, connects
          // it again inside this call, and that call registered it already.
          if (this.#part) {
            return
          }
        }
        this.#owner = owner
        this.#part = {
          slot: config.slot,
          feature: config.feature,
          el,
          props: this.#props(),
          reread: (config.context || config.from) && (() => this.#props()),
          keyed: config.keyed,
        }
        partOwners.set(this, owner)
        slotParts.set(this, this.#part)
        owner.register(this.#part)
      }

      // Put back on the page, a part can connect before what leads to its owner
      // does, like an item in a list its owner renders again. Warned only when
      // the owner is still missing once the task's other elements connected.
      #findOwnerLater() {
        if (!this.isConnected || this.#owner) {
          return
        }
        if (findOwner(this, config.owner)) {
          this.connectedCallback()
        } else if (config.alone) {
          config.alone(boundElement(this, config.target) ?? this, this)
        } else if (!this.hasAttribute("for")) {
          warn(`<${tagName}> must be inside ${config.owner}.`)
        }
      }

      // The element the part binds came, left or was replaced: the part lets go
      // of the old one and registers again with what's there now. One the owner
      // moved into a portal, like an input a sheet puts in its header, stays bound.
      #retarget() {
        const old = this.#part?.el
        if (!this.isConnected || (old && portals.has(old))) {
          return
        }
        const el = boundElement(this, config.target)
        if (el === (old ?? null)) {
          return
        }
        if (this.#owner && this.#part) {
          this.#owner.unregister(this.#part)
        }
        this.#owner = undefined
        this.#part = undefined
        if (el) {
          this.connectedCallback()
        }
      }

      disconnectedCallback() {
        whenGone(this, () => {
          this.#children?.disconnect()
          this.#children = undefined
          if (this.#owner && this.#part) {
            this.#owner.unregister(this.#part)
          }
          partOwners.delete(this)
          slotParts.delete(this)
          this.#owner = undefined
          this.#part = undefined
        })
      }

      attributeChangedCallback(name: string) {
        markAuthored(this, name)
        if (semantics.includes(name)) {
          return
        }
        // A new `for` names another owner, or none. Only a portal move keeps an
        // owner the page no longer names.
        if (name === "for") {
          if (!this.isConnected) {
            return
          }
          if (!findOwner(this, config.owner) && this.#owner && this.#part) {
            this.#owner.unregister(this.#part)
            this.#owner = undefined
            partOwners.delete(this)
          }
          this.connectedCallback()
          return
        }
        if (!this.#owner || !this.#part) {
          if (
            config.alone &&
            this.isConnected &&
            !findOwner(this, config.owner)
          ) {
            config.alone(boundElement(this, config.target) ?? this, this)
          }
          return
        }
        const previous = this.#part.props
        this.#part.props = this.#props()
        const next = this.#part.props
        const rebind =
          rekeyed(previous, next) ||
          !!config.rebind?.some((name) => previous[name] !== next[name])
        this.#owner.update(this.#part, rebind)
        config.changed?.(this)
      }
    }
  )
}

/**
 * Web-only kinds that replace the schema's, by prop name, like
 * `{ container: "string" }` for a container named by a selector. `null`
 * leaves a prop out, for one the element sets itself, like a group it finds
 * around it.
 * @stable
 */
type Kinds = Record<string, PropSpec | null>

/**
 * How `createParts` and `definePart` define a part's element, beyond its tag.
 * @stable
 */
type PartOptions<P extends Primitive = Primitive> = {
  /** The element's tag, like `"ui-tabs-tab"`. */
  tag: string
  /**
   * The slot it fills, when it isn't its key, like a radio filling the root
   * slot of a radio group whose own element is the group.
   */
  slot?: SlotName<P>
  /** Owners of another primitive it belongs to as well, like a calendar day's <ui-date-picker>. */
  owners?: string[]
  kinds?: Kinds
  /** Properties beyond the schema's, read as props. */
  properties?: string[]
} & Omit<
  SlotConfig,
  | "slot"
  | "owner"
  | "props"
  | "properties"
  | "from"
  | "ids"
  | "actions"
  | "keyed"
>

/**
 * How `createParts` and `definePart` define the root's element, the one that owns an instance, beyond its tag.
 * @stable
 */
type RootOptions<P extends Primitive> = {
  /** The element's tag, like `"ui-tabs"`. */
  tag: string
  /**
   * The slot the element itself fills, when it isn't `root`, like a radio
   * group's `group`. Without one, it fills `root` when the primitive has it
   * and no native child fills it.
   */
  self?: SlotName<P>
  kinds?: Kinds
  /**
   * Properties beyond the schema's, which go into the options, like a
   * `filter` function beside its attribute.
   */
  properties?: string[]
  /**
   * Live properties for the state a user controls, like `open` or `value`.
   * Setting one changes the state as a controller would, and fires the
   * change event. An attribute of the same name sets the starting state, and
   * changing it later changes the state the same way.
   */
  state?: Record<
    string,
    {
      get: (api: TypesOf<P>["api"]) => unknown
      set: (api: TypesOf<P>["api"], value: any) => void
    }
  >
  /** The controller's methods, which the element's `api` property exposes. */
  api?: (keyof TypesOf<P>["api"] & string)[]
} & Omit<
  OwnerConfig<P>,
  "attributes" | "properties" | "self" | "state" | "api" | "actions"
>

// The root tags defined for each primitive, so the parts defined after them find their owner.
const rootTags = new WeakMap<Primitive, string[]>()

// A schema's props as an element reads them: string, number, boolean and
// list kinds and parsers from attributes, value kinds from properties, id
// kinds made for each element when left out, and props taken from a part
// around it, which only `kinds` makes attributes too. Callbacks need
// nothing, since every `on*` prop fires an event, and action callbacks hand
// their listeners `waitUntil()`. `id` is the element's own attribute, so
// it's never a prop's unless `kinds` says so.
function elementProps(
  props: Record<string, PropSpec>,
  schema: PrimitiveSchema,
  kinds: Kinds = {}
) {
  const attributes: Record<string, AttributeType> = {}
  const properties: string[] = []
  const ids: string[] = []
  const actions: string[] = []
  let keyed = false
  const from: Record<string, { slot: string; prop: string }> = {}
  for (const [name, spec] of Object.entries({ ...props, ...kinds })) {
    if (!spec) {
      continue
    }
    if (typeof spec === "object") {
      // `"group.id"` names the group's `id`, and `"item"` the item's prop of the same name.
      const [slot, prop = name] = spec.from.split(".")
      // A shared part's prop from a slot this primitive doesn't have, like an
      // item icon's `item` in tabs, has nowhere to come from.
      if (slot in schema.slots) {
        from[name] = { slot, prop }
      }
      if (!(name in kinds)) {
        continue
      }
    }
    const kind = typeof spec === "object" ? spec.kind : spec
    if (kind === "value") {
      properties.push(name)
    } else if (kind === "action") {
      actions.push(name)
    } else if (kind === "id") {
      ids.push(name)
    } else if (kind === "key") {
      keyed = true
    }
    if (kind === "value" || kind === "action" || kind === "callback") {
      continue
    }
    if (name !== "id" || name in kinds) {
      attributes[name] = kind === "id" || kind === "key" ? "string" : kind
    }
  }
  return {
    attributes,
    properties,
    ids,
    actions,
    keyed,
    from: Object.keys(from).length ? from : undefined,
  }
}

const tagOf = <T extends { tag: string }>(tagOrOptions: string | T) =>
  typeof tagOrOptions === "string" ? ({ tag: tagOrOptions } as T) : tagOrOptions

/**
 * What `definePart` defines for a slot: for `root`, the element that owns an
 * instance, with the primitive's options as attributes and properties; for
 * any other slot, an element that finds that owner, with the slot's props.
 * The kinds come from the primitive's schema. A root's tag is remembered, so
 * the parts defined after it find their owner. The docs' elements manifest
 * reads it too.
 */
function partElement<P extends Primitive>(
  primitive: P,
  key: string,
  tagOrOptions: string | RootOptions<P> | PartOptions<P>,
  // The root defined with it, which its owners list first.
  root?: string
) {
  const schema = schemaOf(primitive)
  if (key === "root") {
    const {
      tag,
      self,
      kinds,
      properties = [],
      ...options
    } = tagOf(tagOrOptions as string | RootOptions<P>)
    rootTags.set(primitive, [
      ...new Set([...(rootTags.get(primitive) ?? []), tag]),
    ])
    // `debug` is every owner's own attribute.
    const { debug: _debug, ...optionSchema } = schema.options
    const props = elementProps(optionSchema, schema, kinds)
    const config: OwnerConfig<P> = {
      ...options,
      self:
        self ??
        ("root" in schema.slots && !options.children?.root
          ? "root"
          : undefined),
      attributes: props.attributes,
      // Live state has its own property.
      properties: [...new Set([...props.properties, ...properties])].filter(
        (name) => !options.state?.[name]
      ),
      actions: props.actions,
    }
    return { kind: "owner" as const, key, tagName: tag, config }
  }
  const {
    tag,
    slot = key,
    owners = [],
    kinds,
    properties = [],
    ...options
  } = tagOf(tagOrOptions as string | PartOptions<P>)
  const roots = rootTags.get(primitive)
  if (!roots) {
    throw new Error(
      `<${tag}> is a part of ${primitive.name}: define its root first.`
    )
  }
  // A feature's slot, like a select's select-all option, is in the feature.
  const slotSchema = (schema.slots[slot] ??
    (options.feature?.slots[slot] &&
      ((options.feature.slots[slot] as { props?: object }).props ?? {}))) as
    Record<string, PropSpec> | undefined
  if (!slotSchema) {
    throw new Error(`<${tag}>: ${primitive.name} has no ${slot} slot.`)
  }
  const { attributes, ...props } = elementProps(slotSchema, schema, kinds)
  const config: SlotConfig = {
    ...options,
    slot,
    owner: [...new Set([...(root ? [root] : []), ...roots, ...owners])].join(
      ", "
    ),
    props: attributes,
    ...props,
    properties: [...new Set([...props.properties, ...properties])],
  }
  return { kind: "part" as const, key, tagName: tag, config }
}

/**
 * The tags `createParts` takes: `root` for the element that owns an
 * instance, and each slot it renders by name. A part under another key
 * names its slot, like `{ radio: { tag: "ui-radio", slot: "root" } }`.
 */
type PartTags<P extends Primitive> = { root: string | RootOptions<P> } & {
  [S in Exclude<SlotName<P>, "root">]?: string | PartOptions<P>
}

/**
 * Every element `createParts` defines, as `partElement` describes each, the
 * root first, so its parts know their owner's tag.
 */
function partElements<P extends Primitive>(primitive: P, tags: PartTags<P>) {
  const { root, ...parts } = tags
  const owner = partElement(primitive, "root", root)
  return [
    owner,
    ...Object.entries(
      parts as Record<string, string | PartOptions<P> | undefined>
    ).flatMap(([key, tag]) =>
      tag ? [partElement(primitive, key, tag, owner.tagName)] : []
    ),
  ]
}

function defineElement<P extends Primitive>(
  primitive: P,
  element: ReturnType<typeof partElement<P>>
) {
  if (element.kind === "owner") {
    defineRootElement(element.tagName, primitive, element.config)
  } else {
    definePartElement(element.tagName, element.config)
  }
}

// "tab-icon" is `TabIcon`.
type Pascal<Name extends string> = Name extends `${infer Head}-${infer Tail}`
  ? `${Capitalize<Head>}${Pascal<Tail>}`
  : Capitalize<Name>

const pascal = (name: string) =>
  name.replace(/(^|-)(\w)/g, (_, _dash, char: string) => char.toUpperCase())

/**
 * The element classes `createParts` returns: `Root`, and one per tagged
 * part, named in Pascal case. Each is `undefined` on the server.
 * @stable
 */
type Parts<Tags> = {
  [K in keyof Tags & string as Pascal<K>]: CustomElementConstructor | undefined
}

/**
 * Defines a custom element for each part of a primitive, typed from it.
 * `root` is the element that owns an instance: the primitive's options are
 * its attributes (strings, numbers, booleans and comma-separated lists),
 * each reflected by a property, and properties (any other value), and its
 * callbacks are events, like
 * `onValueChange` firing `valuechange`. Every other slot named becomes an
 * element that finds the root above it, with the slot's props read the same
 * way. A part that needs more than a tag takes an object, like
 * `{ tag, display, target, render }`, and the root's takes `state`, `api` and
 * `display` too. Defines each tag once, and returns the element classes,
 * `Root` and one per part named in Pascal case, like `TabIcon` for
 * `tab-icon`. On the server it defines nothing and the classes are
 * `undefined`.
 *
 * @example
 * createParts(tabs, {
 *   root: { tag: "ui-tabs", display: "block", api: ["select"] },
 *   list: "ui-tabs-list",
 *   // Binds the <button> inside, so it stays a real button.
 *   tab: { tag: "ui-tabs-tab", display: "contents", target: wrappedButton },
 *   panel: "ui-tabs-panel",
 * })
 * @stable
 */
function createParts<P extends Primitive, Tags extends PartTags<P>>(
  primitive: P,
  tags: Tags
) {
  const parts: Record<string, CustomElementConstructor | undefined> = {}
  for (const element of partElements(primitive, tags)) {
    defineElement(primitive, element)
    parts[pascal(element.key)] =
      typeof customElements === "undefined"
        ? undefined
        : customElements.get(element.tagName)
  }
  return parts as Parts<Tags>
}

/**
 * Defines the custom element for one part of a primitive, written by hand:
 * the root, which owns an instance, or a part that finds the root above it.
 * Its attributes, properties and events come from the primitive's schema, as
 * in `createParts`. Define the root first. A second root of the same
 * primitive, like a submenu's, owns the parts defined after it too.
 *
 * @example
 * definePart(rating, "root", "my-rating")
 * definePart(rating, "star", { tag: "my-rating-star", target: wrappedButton })
 */
function definePart<P extends Primitive, S extends SlotName<P> | "root">(
  primitive: P,
  slot: S,
  tagOrOptions: S extends "root"
    ? string | RootOptions<P>
    : string | PartOptions<P>
) {
  defineElement(primitive, partElement(primitive, slot, tagOrOptions))
}

export {
  type AttributeType,
  autoId,
  claimTag,
  createParts,
  definePart,
  findContainer,
  findOwner,
  inheritedPortal,
  instanceOf,
  type Kinds,
  ownButton,
  parseAttribute,
  type PartDisplay,
  partElement,
  partElements,
  type PartOptions,
  type Parts,
  type PartTags,
  passPortalOn,
  type RootOptions,
  reconfigureInside,
  setDisplay,
  upgradeProperties,
  whenGone,
  wrappedButton,
  wrappedChild,
}
