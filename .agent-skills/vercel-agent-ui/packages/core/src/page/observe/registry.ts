// The registry the agent bridge and `observe` share: every component on the
// page with a ref that stays stable while it's there, its accessible name and
// row text read from its elements, and every change that goes through, settled
// or step by step, once either entry installs it on the kernel's `watchers`.
import type { AgentComponent } from "../agent/agent"
import type { ChangeSource } from "../../foundation/kernel/details"
import type {
  AgentSurface,
  Part,
  PrimitiveInstance,
  PropSpec,
} from "../../foundation/kernel/primitive-types"
import { watchEarlier, watchers } from "../../foundation/kernel/watchers"
import { accessibleName } from "../../foundation/text/accessible-name"
import { checkMarks, isOffLimits, isSecret, textOf } from "./marks"

/**
 * A change a person or an agent made to a component, as `observe` and `agent.subscribe` report it.
 * @stable
 */
type ObservedChange = {
  /** The component's ref, the same as in the agent's `snapshot`, like `"c4"`. */
  ref: string
  /** The component, like `"select"`. */
  component: string
  /** The instance's id. */
  id: string
  /** Its accessible name, from its label or its element. */
  label?: string
  /** Other text on its row, like the name beside a member's menu. */
  row?: string
  /** What changed, like `"value"` or `"open"`. */
  key: string
  /** The new value. `"[redacted]"` for a password, card or one-time-code field, or one inside `data-agent-secret`. */
  value: unknown
  /**
   * The value before the change, redacted the same way, so a log can undo it.
   * For a change a commit settles, like a slider's drag, the value before the
   * interaction began.
   */
  previous: unknown
  /** Why it changed, like `"item-press"` or `"escape-key"`. A settled change has its commit's. */
  reason: string
  /** Who changed it: `"mouse"`, `"touch"`, `"pen"`, `"keyboard"`, `"virtual"`, `"programmatic"` or `"agent"`. */
  source: ChangeSource
}

type Entry = {
  ref: string
  // The instance's id, which the kernel's changes carry.
  id: string
  // What named it on screen when last seen, `component|label|row`, so a component that comes back keeps its ref.
  key?: string
  label?: string
  row?: string
  // A password, card or one-time code, or a field inside `data-agent-secret`,
  // whose value is redacted and isn't kept once it leaves the page.
  secret?: boolean
  // Inside `data-agent-hidden`, or a hidden input: the agent never sees it, and it
  // isn't kept once it leaves the page. The app's own `observe` still hears it.
  offLimits?: boolean
  component: string
  // What its primitive's `agent` key declares.
  agent: AgentSurface | undefined
  // Its primitive's options by kind, which an agent's arguments are checked against.
  options: Record<string, PropSpec> | undefined
  controlled: string[] | undefined
  // The keys an interaction changes in steps and then commits, like a slider's `value`.
  commits: string[] | undefined
  // Each of those keys' value before the steps not yet committed, by key.
  started: Map<string, unknown>
  // Weak, so an instance a framework made and never mounted, like a render
  // React discarded, can still be collected.
  instance: WeakRef<PrimitiveInstance>
}
type Bound = Part & { el: HTMLElement }

const entries = new Map<string, Entry>()
// The same entries by instance id, for the changes the kernel reports.
const byId = new Map<string, Entry>()
// Refs of components that left, by key, for the same components when they come
// back, like a tab's fields. Components that leave together, with none made
// between them, like a tab's twins with the same label, queue in the order
// they left, so they take back their own refs; a later departure replaces an
// earlier one. `at` is the instance count when they left. The most recent
// `retiredLimit` keys, for a page that swaps many components in and out.
const retired = new Map<string, { at: number; refs: string[] }>()
const retiredLimit = 500
// What those components showed when they left, so an agent can check a closed tab without opening it.
const offPage = new Map<string, AgentComponent>()
const partsOf = new WeakMap<PrimitiveInstance, ReadonlyMap<string, Part>>()
let count = 0
type Listener = (change: ObservedChange, parts: Bound[]) => void
// Every listener, and whether it hears each step (`live`) rather than settled changes.
const listeners = new Map<Listener, boolean>()

function watch(
  instance: PrimitiveInstance,
  parts: ReadonlyMap<string, Part>,
  {
    controlled,
    commits,
    agent,
    options,
  }: Parameters<NonNullable<typeof watchers.add>>[2]
) {
  const entry: Entry = {
    ref: `c${++count}`,
    id: instance.id,
    component: instance.name,
    agent,
    options,
    controlled,
    commits,
    started: new Map(),
    instance: new WeakRef(instance),
    secret: agent?.secret,
  }
  entries.set(entry.ref, entry)
  byId.set(entry.id, entry)
  partsOf.set(instance, parts)
  return () => retire(entry)
}

function retire(entry: Entry) {
  if (entries.get(entry.ref) !== entry) {
    return
  }
  entries.delete(entry.ref)
  if (byId.get(entry.id) === entry) {
    byId.delete(entry.id)
  }
  if (!entry.key || entry.secret || entry.offLimits) {
    return
  }
  const queued = retired.get(entry.key)
  if (queued?.at === count) {
    queued.refs.push(entry.ref)
  } else {
    // Deleted first, so the key moves to the newest end.
    retired.delete(entry.key)
    retired.set(entry.key, { at: count, refs: [entry.ref] })
    if (retired.size > retiredLimit) {
      retired.delete(retired.keys().next().value!)
    }
  }
  // Values and checks are worth keeping. A closed menu's `open: false` isn't.
  const state = entry.instance.deref()?.get() as
    Record<string, unknown> | undefined
  const keys = stateKeys(entry, state ?? {}).filter((key) => key !== "open")
  if (!state || !keys.length) {
    return
  }
  const last: AgentComponent = {
    ref: entry.ref,
    component: entry.component,
    offPage: true,
    actions: [],
  }
  if (entry.label) {
    last.label = entry.label
  }
  if (entry.row) {
    last.row = entry.row
  }
  for (const key of keys) {
    if (key === "value" || state[key] !== "") {
      last[key] = state[key] ?? null
    }
  }
  offPage.delete(entry.ref)
  offPage.set(entry.ref, last)
  // The most recent 50, for a page that swaps many components in and out.
  if (offPage.size > 50) {
    offPage.delete(offPage.keys().next().value!)
  }
}

// Fields a browser tool stops seeing when they close, so the bridge doesn't keep them either.
const secret =
  /\b(password|current-password|new-password|one-time-code|cc-[a-z-]+)\b/i

const stateKeys = (entry: Entry, state: Record<string, unknown>) =>
  entry.controlled ?? ["open", "value", "checked"].filter((key) => key in state)

// The api method that sets a state key, like `setOpen` for `open`.
const setterOf = (key: string) => `set${key[0].toUpperCase()}${key.slice(1)}`

// Keeps the component's key current, and the first time it's seen gives it
// the ref it had before it left the page, when one with its key did.
function remember(entry: Entry, parts: Bound[]) {
  const first = !entry.key
  const elements = parts.map((part) => part.el)
  checkMarks(elements)
  entry.label = componentLabel(parts)
  entry.row = rowOf(parts)
  entry.secret ||=
    isSecret(elements) ||
    parts.some(({ el }) =>
      secret.test(
        `${el.getAttribute("type")} ${el.getAttribute("autocomplete")}`
      )
    )
  // A region can turn off-limits and back, like a panel an app locks while it's busy.
  // A hidden input holds what the page keeps from people, like a token.
  entry.offLimits =
    isOffLimits(elements) ||
    elements.every((el) => (el as HTMLInputElement).type === "hidden")
  entry.key = `${entry.component}|${entry.label}|${entry.row}`
  if (!first) {
    return
  }
  const queue = retired.get(entry.key)?.refs
  const ref = queue?.shift()
  if (!ref) {
    return
  }
  if (!queue!.length) {
    retired.delete(entry.key)
  }
  offPage.delete(ref)
  entries.delete(entry.ref)
  entry.ref = ref
  entries.set(ref, entry)
}

function bound(instance: PrimitiveInstance) {
  return [...(partsOf.get(instance)?.values() ?? [])].filter(
    (part) => part.el?.isConnected
  ) as Bound[]
}

function componentLabel(parts: Bound[]) {
  const keyless = (slot: string) =>
    parts.find((part) => part.slot === slot && !part.key)?.el
  // Not when the slot has many keys: an accordion's first trigger names its
  // item, not the accordion. A dialog's one trigger does name it, and so does
  // a label the web adapter keys by its element.
  const first = (slot: string) => {
    const found = parts.filter((part) => part.slot === slot)
    return new Set(found.map((part) => part.key)).size === 1
      ? found[0].el
      : found.find((part) => !part.key)?.el
  }
  const text = (el: Element | undefined) =>
    (el && textOf(el).slice(0, 80)) || undefined
  const label = text(first("label"))
  if (label) {
    return label
  }
  // A group's own element names it before its items do.
  const group = keyless("group") ?? keyless("root")
  const name = group && accessibleName(group)
  if (name) {
    return name
  }
  // Then its field's name, like a date picker's input labelled "Due date",
  // before a heading that changes with what it shows, like "November 2026",
  // and a step button before it. Not a search field in its popup, which comes and goes.
  const input = parts.find(
    (part) =>
      part.slot === "input" ||
      (part.slot === "control" && part.el.matches("input, textarea"))
  )?.el
  const popup = parts.find((part) => part.slot === "content")?.el
  const field = input && !popup?.contains(input) && accessibleName(input)
  if (field) {
    return field
  }
  // Then what names it on screen: a title, a heading, a trigger or the button it is.
  const root = keyless("root")
  const button =
    root &&
    (root.tagName === "BUTTON" || root.getAttribute("role") === "button")
      ? root
      : undefined
  const named = (el: Element | undefined) =>
    (el && accessibleName(el)) || text(el)
  const shown =
    named(first("title")) ??
    named(first("heading")) ??
    named(first("trigger")) ??
    named(button)
  if (shown) {
    return shown
  }
  // Then any part's own name, keyless first, so an accordion isn't named by
  // its first item, but a slider is by its one thumb. Next, a shown part alone
  // in its slot with a key of its own, which the web adapter gives every part.
  const keys = new Set(parts.map((part) => part.key).filter(Boolean))
  const keyed = keys.size === 1 ? parts.filter((part) => part.key) : []
  const sole = parts.filter(
    (part) =>
      part.key &&
      !part.slot.startsWith("group") &&
      !part.el.closest("[hidden]") &&
      parts.every(
        (other) =>
          other === part || (other.slot !== part.slot && other.key !== part.key)
      )
  )
  for (const part of [
    ...parts.filter((part) => !part.key),
    ...sole,
    ...keyed,
  ]) {
    const name = accessibleName(part.el)
    if (name) {
      return name
    }
  }
}

// A table's header row holds column titles, not a record.
const headerRow = (row: Element) =>
  !!row.closest("thead") ||
  (row.children.length > 0 &&
    [...row.children].every(
      (cell) =>
        cell.localName === "th" || cell.getAttribute("role") === "columnheader"
    ))

// Text in the component's row that isn't the component's own, its parts' or
// its label's, like the name beside a member's menu, so an agent knows which
// row it is.
function rowOf(parts: Bound[]) {
  const el = (
    parts.find((part) => part.slot === "trigger" || part.slot === "root") ??
    parts[0]
  )?.el
  const row = el?.closest("li, tr, [role=row], [role=listitem]")
  if (!row || headerRow(row) || parts.some((part) => part.el.contains(row))) {
    return
  }
  const own = parts.flatMap(({ el }) => [
    el,
    ...((el as HTMLInputElement).labels ?? []),
  ])
  const words: string[] = []
  const walker = row.ownerDocument.createTreeWalker(row, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (
      !own.some((el) => el.contains(node)) &&
      !isOffLimits([node.parentElement!]) &&
      node.textContent?.trim()
    ) {
      words.push(node.textContent.trim())
    }
  }
  return words.join(" ").slice(0, 80) || undefined
}

type Details = { reason: string; source: ChangeSource }

// A change the kernel reports. Live listeners hear every step. Settled ones
// hear a person's steps on a key the component commits at its commit instead.
// A change no person made, like a value set from code or by an agent, has no
// interaction to commit it, so they hear it now.
function report(
  id: string,
  key: string,
  value: unknown,
  details: Details,
  previous: unknown
) {
  const entry = byId.get(id)
  if (!listeners.size || !entry) {
    return
  }
  const { source } = details
  const held =
    !!entry.commits?.includes(key) &&
    source !== "programmatic" &&
    source !== "agent"
  // A person's first step keeps the value before it. A change no person made
  // between steps is reported now, so the commit starts after it.
  if (entry.started.has(key) !== held) {
    entry.started.set(key, held ? previous : value)
  }
  send(entry, key, value, details, previous, held || undefined)
}

// A commit the kernel reports: one settled change for the steps before it,
// from the value before the first. A commit with no steps held, like one a
// call from code makes, was reported as it changed.
function settle(id: string, key: string, value: unknown, details: Details) {
  const entry = byId.get(id)
  if (!listeners.size || !entry?.started.has(key)) {
    return
  }
  send(entry, key, value, details, entry.started.get(key), false)
  entry.started.delete(key)
}

// A change as a record for the listeners it's for, named the way the agent's
// snapshot names the component: live ones for `live` true, settled ones for
// false, and every one when it's undefined.
function send(
  entry: Entry,
  key: string,
  value: unknown,
  details: Details,
  previous: unknown,
  live?: boolean
) {
  const instance = entry.instance.deref()
  if (!instance) {
    return
  }
  const parts = bound(instance)
  if (parts.length) {
    remember(entry, parts)
  }
  const change: ObservedChange = {
    ref: entry.ref,
    component: entry.component,
    id: entry.id,
    key,
    value: entry.secret ? "[redacted]" : value,
    previous: entry.secret ? "[redacted]" : previous,
    reason: details.reason,
    source: details.source,
  }
  if (entry.label) {
    change.label = entry.label
  }
  if (entry.row) {
    change.row = entry.row
  }
  listeners.forEach(
    (hearsSteps, listener) =>
      (live ?? hearsSteps) === hearsSteps && listener(change, parts)
  )
}

/** Starts hearing components as they're made. The agent and `observe` both call it. */
function install() {
  // A server renders each page once and never binds, so nothing would ever
  // leave the registry: every request's components would stay in memory.
  if (typeof document === "undefined") {
    return
  }
  if (watchers.add) {
    return
  }
  watchers.add = watch
  watchers.change = report
  watchers.commit = settle
  watchEarlier()
}

/**
 * Calls `listener` with every settled change, or with every step when `live`
 * is true, until the returned function runs.
 */
function listen(listener: Listener, live = false) {
  install()
  listeners.set(listener, live)
  return () => {
    listeners.delete(listener)
  }
}

/** The bound elements of the component a ref names, in the order they bound. */
function elementsOf(ref: string) {
  const instance = entries.get(ref)?.instance.deref()
  return instance ? bound(instance).map((part) => part.el) : []
}

export {
  bound,
  type Bound,
  componentLabel,
  elementsOf,
  entries,
  type Entry,
  install,
  listen,
  type ObservedChange,
  offPage,
  remember,
  retire,
  rowOf,
  setterOf,
  stateKeys,
}
