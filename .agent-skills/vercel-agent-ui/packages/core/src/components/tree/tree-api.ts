// What makes a tree a tree, on the same public blocks a component of your own
// uses: the tab stop and arrow keys from `createRovingFocus`, the selection rules
// from `createSelection`, focus that survives a collapse from
// `createFocusRecovery`, group animations from `bindPanel`, and the shape from a
// tree collection, built from `items` or from the items in the page.
import { warn } from "#dev"
import { announce } from "../../foundation/platform/announce"
import { isRTL } from "../../foundation/platform/env"
import { createFocusRecovery } from "../../foundation/focus/focus-recovery"
import { bindPanel, stateAndRenders } from "../../foundation/motion/panel"
import { isApple } from "../../foundation/platform/platform"
import { createRovingFocus } from "../../foundation/focus/roving-focus"
import {
  createTypeahead,
  isTypeaheadKey,
  labelOf,
} from "../../foundation/text/typeahead"
import { inDocumentOrder } from "../../foundation/kernel/order"
import { createChange } from "../../foundation/kernel/input-source"
import { elements } from "../../foundation/kernel/elements"
import { announcePending, isPromise } from "../../foundation/kernel/action"
import { deriveFromOptions } from "../../foundation/kernel/derive"
import type {
  Part,
  PrimitiveContext,
} from "../../foundation/kernel/primitive-types"
import { createSelection } from "../../foundation/selection/selection-model"
import {
  toggleTreeChecked,
  treeCheckedStates,
  type TreeCheckStrategy,
} from "../../foundation/lists/tree-checked"
import {
  createTreeCollection,
  treeDataNodes,
  treeFromPaths,
  type TreeCollection,
  type TreeItemData,
} from "../../foundation/lists/tree-collection"
import type {
  TreeAnnouncement,
  TreeChangeOptions,
  TreeCheckedChangeReason,
  TreeExpandedChangeReason,
  TreeItemProps,
  TreeOptions,
  TreeMode,
  TreeValueChangeReason,
} from "./tree"

type TreeStore = {
  // The selected value in its public shape, and the same as keys for the selection rules.
  value: string | string[] | null
  selected: string[]
  expanded: string[]
  // The checked value as reported, and every item's checkbox that isn't unchecked.
  checked: string[]
  checks: Record<string, true | "indeterminate">
  mode: TreeMode
  checkable: boolean
  checkStrategy: TreeCheckStrategy
  activation: "automatic" | "manual"
  expandOnPress: boolean
  disabled: boolean
  // Disabled by a fieldset around it.
  formDisabled: boolean
  focusableWhenDisabled: boolean
  keepMounted: boolean
  hiddenUntilFound: boolean
  current: string | null
  items: TreeItemData[] | undefined
  paths: readonly string[] | undefined
  // The item with the tab stop, null until items bind.
  active: string | null
  // Collapsed branches whose group is still animating out.
  exiting: string[]
  // Branches loading their children, and the ones whose last load failed.
  loading: string[]
  failed: string[]
  // Items whose `onAction` Promise hasn't settled.
  pending: string[]
  // Bumped after items join, leave or move: everywhere, and per parent, by its value or "" at the top.
  version: number
  siblings: Record<string, number>
}

type Why<Reason> = { reason: Reason; event?: Event }
type Item = { key: string; props: TreeItemProps }

const sameChecks = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => a[key] === b[key])
  )
}

const toKeys = (value: TreeStore["value"]) =>
  Array.isArray(value) ? value : value == null ? [] : [value]

// Labels that aren't plain text name the item with `label`; a branch's own
// text never includes its children's, which sit outside its label.
const defaultAnnouncement = ({ type, label }: TreeAnnouncement) =>
  type === "expanded"
    ? "Expanded"
    : type === "collapsed"
      ? "Collapsed"
      : type === "loading"
        ? "Loading"
        : `Couldn't load ${label}.`

/**
 * `tree`'s api, which its slots and controller call. Adapters
 * expose it as `api`.
 * @stable
 */
interface TreeApi extends ReturnType<typeof treeApiBody> {}

function treeApiBody(
  context: PrimitiveContext<TreeOptions, TreeStore, string>
) {
  const { id, store, options } = context
  announcePending(context, () => store.get().pending.length > 0)
  const change = createChange(context)
  const typeahead = createTypeahead()
  const itemProps = (key: string) => context.props<TreeItemProps>("item", key)
  const itemElement = (key: string | null | undefined) =>
    key == null ? undefined : context.element("item", key)

  // The shape `items` or `paths` give, kept per array: while new items render,
  // reads alternate between the rendering array and the committed one.
  const built = new WeakMap<
    object,
    {
      items: TreeItemData[]
      tree: TreeCollection
      byKey: Map<string, TreeItemData>
    }
  >()
  function fromData() {
    const { items, paths } = store.get()
    const next = items ?? paths
    if (!next) {
      return undefined
    }
    let data = built.get(next)
    if (!data) {
      const list = items ?? treeFromPaths(paths!)
      const nodes = treeDataNodes(list)
      data = {
        items: list,
        tree: createTreeCollection(nodes),
        byKey: new Map(nodes.map((node) => [node.key, node.item])),
      }
      built.set(next, data)
    }
    return data
  }

  // The shape the items in the page give, rebuilt after they join, leave or move.
  let composed: TreeCollection | undefined
  let composedAt = -1
  function fromParts(version = store.get().version) {
    if (composed && composedAt === version) {
      return composed
    }
    composedAt = version
    const bound = elements<TreeItemProps>(context, "item")
    const keys = new Set(bound.map((entry) => entry.key))
    const nodes = bound.map(({ key, props }) => ({
      key,
      parent: props.parent ?? null,
      branch: props.branch,
    }))
    // Items not in the page yet, like on the server, keep the order they rendered in.
    for (const part of context.parts()) {
      if (part.slot === "item" && !keys.has(part.key)) {
        const props = part.props as TreeItemProps
        nodes.push({
          key: part.key,
          parent: props.parent ?? null,
          branch: props.branch,
        })
      }
    }
    return (composed = createTreeCollection(nodes))
  }

  const shape = () => fromData()?.tree ?? fromParts()

  function parentOf(key: string) {
    const known = fromData()
    return known ? known.tree.parent(key) : (itemProps(key)?.parent ?? null)
  }

  // Outermost first. A parent chain that loops stops where it repeats.
  function ancestors(key: string) {
    const found: string[] = []
    const seen = new Set([key])
    for (
      let up = parentOf(key);
      up !== null && !seen.has(up);
      up = parentOf(up)
    ) {
      seen.add(up)
      found.unshift(up)
    }
    return found
  }

  const isBranch = (key: string, props = itemProps(key)) =>
    props?.branch ?? fromData()?.tree.isBranch(key) ?? false

  function isDisabled(state: TreeStore, key: string, props = itemProps(key)) {
    return (
      state.disabled ||
      state.formDisabled ||
      !!props?.disabled ||
      !!fromData()?.byKey.get(key)?.disabled
    )
  }

  // Whether every ancestor is expanded, so the item shows. One set per expanded list.
  let openFor: readonly string[] | undefined
  let open = new Set<string>()
  function shows(key: string, expanded: readonly string[]) {
    if (expanded !== openFor) {
      open = new Set((openFor = expanded))
    }
    return ancestors(key).every((ancestor) => open.has(ancestor))
  }

  const focusable = (state: TreeStore, item: Item) =>
    shows(item.key, state.expanded) &&
    (state.focusableWhenDisabled || !isDisabled(state, item.key, item.props))

  // The item that takes the tab stop first: the current page's, else the first selected.
  const preferredKey = (state: TreeStore) =>
    state.current ?? state.selected[0] ?? null

  const roving = createRovingFocus<TreeStore, TreeItemProps>(context, {
    slot: "item",
    key: "active",
    disabled: (item) => isDisabled(store.get(), item.key, item.props),
    focusable: (item) => focusable(store.get(), item),
    preferred: (item) => {
      const state = store.get()
      return state.current === item.key || state.selected.includes(item.key)
    },
    // On the server, the preferred item holds the stop when it shows, else the first item.
    claims: (state, item) => {
      if (!focusable(state, item) || isDisabled(state, item.key, item.props)) {
        return false
      }
      const preferred = preferredKey(state)
      const known = fromData()
      if (
        preferred === null ||
        (known &&
          !(known.tree.has(preferred) && shows(preferred, state.expanded)))
      ) {
        return true
      }
      return item.key === preferred
    },
    move: (event, { from, items }) => {
      wanted = moveTarget(
        event,
        from.key,
        dataKeys() ?? items.map((item) => item.key)
      )
      return wanted
    },
    onItemsChange: () => focusLandedChild(),
  })

  // With data, the keys of the rows that show and can take focus, rendered or not.
  function dataKeys() {
    const state = store.get()
    return fromData()
      ?.tree.visible(state.expanded)
      .filter((key) => state.focusableWhenDisabled || !isDisabled(state, key))
  }

  // The keys of the items that show, in order: from data, or the items in the page.
  const visibleKeys = () => dataKeys() ?? roving.items().map((item) => item.key)

  // Where Up, Down, Home and End go. With data, that's any row that shows,
  // rendered or not, so a virtualized list can follow.
  let wanted: string | undefined
  function moveTarget(
    event: KeyboardEvent,
    from: string,
    keys: readonly string[]
  ) {
    const index = keys.indexOf(from)
    if (event.key === "ArrowDown") {
      return keys[index + 1]
    }
    if (event.key === "ArrowUp") {
      return index > 0 ? keys[index - 1] : undefined
    }
    if (event.key === "Home") {
      return keys[0]
    }
    if (event.key === "End") {
      return keys.at(-1)
    }
  }

  const selection = createSelection<
    TreeOptions,
    TreeStore,
    "selected",
    TreeValueChangeReason
  >(context, {
    key: "selected",
    set: (keys, details) =>
      setValue(
        store.get().mode === "multiple" ? keys : (keys[0] ?? null),
        details
      ),
    order: visibleKeys,
    multiple: () => store.get().mode === "multiple",
    selectable: (key) =>
      store.get().mode !== "none" && !isDisabled(store.get(), key),
  })

  function setValue(
    value: TreeStore["value"],
    why: Why<TreeValueChangeReason>
  ) {
    return change("value", value, why)
  }

  // Focus inside a branch that collapses goes to the outermost collapsed
  // ancestor, else the parent, else the first item that shows.
  const recovery = createFocusRecovery<TreeItemProps>({
    fallback: ({ key }) => {
      const { expanded } = store.get()
      const path = ancestors(key)
      const collapsed = path.find((ancestor) => !expanded.includes(ancestor))
      return (
        itemElement(collapsed ?? path.at(-1)) ??
        roving.items().find((item) => item.key !== key)?.el
      )
    },
  })

  // Every item's checkbox that isn't unchecked, from the checked value and the shape.
  function checksFor(state: TreeStore) {
    if (!state.checkable) {
      return {}
    }
    const known = fromData()
    const tree = known?.tree ?? fromParts(state.version)
    const read = treeCheckedStates(tree, state.checked, state.checkStrategy)
    const checks: Record<string, true | "indeterminate"> = {}
    for (const key of tree.keys()) {
      const checked = read(key)
      if (checked) {
        checks[key] = checked
      }
    }
    // Checked items not rendered yet, like on the server, show as checked.
    for (const key of state.checked) {
      if (!tree.has(key)) {
        checks[key] = true
      }
    }
    return checks
  }

  // Derived state, kept in step with what it's derived from: the selection's
  // keys, the checkboxes, and the groups still animating out.
  function followUp(before: TreeStore, state: TreeStore) {
    const patch: Partial<TreeStore> = {}
    if (state.value !== before.value) {
      patch.selected = toKeys(state.value)
    }
    if (
      (state.checkable || before.checkable) &&
      (state.checked !== before.checked ||
        state.checkable !== before.checkable ||
        state.checkStrategy !== before.checkStrategy ||
        state.items !== before.items ||
        state.paths !== before.paths ||
        state.version !== before.version)
    ) {
      const checks = checksFor(state)
      if (!sameChecks(checks, state.checks)) {
        patch.checks = checks
      }
    }
    if (state.expanded !== before.expanded) {
      const closed = before.expanded.filter(
        (key) => !state.expanded.includes(key) && context.element("group", key)
      )
      patch.exiting = [
        ...new Set([
          ...state.exiting.filter((key) => !state.expanded.includes(key)),
          ...closed,
        ]),
      ]
    }
    return patch
  }
  // A tree that starts or stops selecting several keeps what was chosen, in
  // its new shape, unless the value is controlled.
  deriveFromOptions(context, ["value", "selected"], (synced, state, next) => {
    const several = synced.mode === "multiple"
    if (synced.mode === undefined || several === (state.mode === "multiple")) {
      return
    }
    if (next.value !== undefined) {
      return
    }
    const value = several
      ? toKeys(state.value)
      : (toKeys(state.value)[0] ?? null)
    return { value, selected: toKeys(value) }
  })
  // What options deliver brings its follow-up state in the same pass.
  deriveFromOptions(
    context,
    ["selected", "checks", "exiting"],
    (synced, state) => followUp(state, { ...state, ...synced })
  )
  let seen = store.get()
  function derive() {
    const state = store.get()
    const before = seen
    seen = state
    store.set(followUp(before, state))
    // A new current page, or data arriving for one, reveals it.
    const dataArrived =
      !(before.items ?? before.paths) && !!(state.items ?? state.paths)
    if (
      state.current !== null &&
      (state.current !== before.current || dataArrived)
    ) {
      revealCurrent(state.current)
    }
  }
  context.onDestroy(store.subscribe(derive))

  function revealCurrent(current: string) {
    const known = fromData()
    const path = known
      ? known.tree.has(current)
        ? known.tree.ancestors(current)
        : []
      : ancestors(current)
    const { expanded } = store.get()
    const hidden = path.filter((ancestor) => !expanded.includes(ancestor))
    if (hidden.length) {
      setExpanded([...expanded, ...hidden], { reason: "imperative" })
    }
  }

  // The first state: the selection's keys, the checkboxes, and with data, the
  // current item's ancestors expanded.
  {
    const state = store.get()
    const first: Partial<TreeStore> = { selected: toKeys(state.value) }
    const known = fromData()
    if (
      known &&
      state.current !== null &&
      options().expanded === undefined &&
      known.tree.has(state.current)
    ) {
      first.expanded = [
        ...new Set([...state.expanded, ...known.tree.ancestors(state.current)]),
      ]
    }
    store.set(first)
    store.set({ checks: checksFor(store.get()) })
    seen = store.get()
  }
  if (store.get().checkable && store.get().mode !== "none") {
    warn(
      'has checkboxes and a selection, so items are both checked and selected. Pass `mode="none"` unless both mean something.',
      { component: "tree", id }
    )
  }

  // Items joining, leaving or moving bump the version once, a microtask later.
  let bumpQueued = false
  function bump() {
    if (bumpQueued) {
      return
    }
    bumpQueued = true
    queueMicrotask(() => {
      bumpQueued = false
      store.set({ version: store.get().version + 1 })
    })
  }

  // Bound items by their parent's value, or "" at the top, for their places among their siblings.
  const byParent = new Map<string, Set<string>>()
  const boundParent = new WeakMap<Element, string>()
  const orders = new Map<
    string,
    { revision: number; index: Map<string, number>; size: number }
  >()
  let movedParents = new Set<string>()
  // A parent whose children joined, left or moved bumps its revision once, a microtask later.
  function bumpSiblings(parent: string) {
    if (!movedParents.size) {
      queueMicrotask(() => {
        const parents = movedParents
        movedParents = new Set()
        const siblings = { ...store.get().siblings }
        for (const key of parents) {
          siblings[key] = (siblings[key] ?? 0) + 1
        }
        store.set({ siblings })
      })
    }
    movedParents.add(parent)
  }
  function siblingOrder(parent: string, revision: number) {
    const known = orders.get(parent)
    if (known && known.revision === revision) {
      return known
    }
    const entries = [...(byParent.get(parent) ?? [])].flatMap((key) => {
      const el = itemElement(key)
      return el?.isConnected ? [{ key, el }] : []
    })
    const sorted = inDocumentOrder(entries)
    const order = {
      revision,
      index: new Map(sorted.map((entry, index) => [entry.key, index + 1])),
      size: sorted.length,
    }
    orders.set(parent, order)
    return order
  }

  const labelText = (key: string) => {
    const label = context.element("label", key)
    if (label) {
      return labelOf(label)
    }
    return itemProps(key)?.label ?? fromData()?.byKey.get(key)?.label ?? key
  }
  function say(type: TreeAnnouncement["type"], key: string) {
    if ((type === "expanded" || type === "collapsed") && !isApple()) {
      return
    }
    const text = (options().announcement ?? defaultAnnouncement)({
      type,
      value: key,
      label: labelText(key),
    })
    if (text) {
      announce(text)
    }
  }

  // Branches expanded with Alt or Option, whose branches rendered later expand too.
  const deep = new Set<string>()
  let deepAll = false
  let deepWhy: Why<TreeExpandedChangeReason> = { reason: "imperative" }
  const inDeep = (key: string) =>
    deepAll || ancestors(key).some((ancestor) => deep.has(ancestor))

  // Children loading, and the branches that have loaded.
  const loaded = new Set<string>()
  const loads = new Map<string, AbortController>()
  context.onDestroy(() => loads.forEach((load) => load.abort()))
  const needsLoad = (key: string) =>
    !!options().loadChildren &&
    !loaded.has(key) &&
    isBranch(key) &&
    shape().children(key).length === 0

  function setLoading(
    key: string,
    on: boolean,
    failed = store.get().failed.includes(key)
  ) {
    const { loading, failed: before } = store.get()
    store.set({
      loading: on
        ? [...loading, key]
        : loading.filter((other) => other !== key),
      failed: failed
        ? [...new Set([...before, key])]
        : before.filter((other) => other !== key),
    })
  }

  // A branch whose children are loading because a key asked to step into it.
  let stepInto: string | null = null
  let stepIntoEvent: KeyboardEvent | undefined

  function load(key: string, why: Why<TreeExpandedChangeReason>) {
    const running = loads.get(key)
    if (running) {
      running.abort()
      loads.delete(key)
      setLoading(key, false)
      return false
    }
    const controller = new AbortController()
    const done = (ok: boolean) => {
      if (controller.signal.aborted) {
        return
      }
      loads.delete(key)
      setLoading(key, false, !ok)
      if (!ok) {
        return say("load-failed", key)
      }
      loaded.add(key)
      setExpanded([...store.get().expanded, key], why)
    }
    let result: unknown
    try {
      result = options().loadChildren!(key, { signal: controller.signal })
    } catch {
      setLoading(key, false, true)
      say("load-failed", key)
      return false
    }
    if (!isPromise(result)) {
      loaded.add(key)
      return setExpanded([...store.get().expanded, key], why)
    }
    loads.set(key, controller)
    setLoading(key, true, false)
    say("loading", key)
    result.then(
      () => done(true),
      () => done(false)
    )
    return false
  }

  function setExpanded(expanded: string[], why: Why<TreeExpandedChangeReason>) {
    return change("expanded", [...new Set(expanded)], why)
  }

  function setOpen(
    key: string,
    opening: boolean,
    why: Why<TreeExpandedChangeReason>
  ) {
    const { expanded } = store.get()
    if (!opening) {
      deep.delete(key)
      loads.get(key)?.abort()
      loads.delete(key)
      // A step into a branch ends with it, so a later expand doesn't take focus or selection.
      if (stepInto === key) {
        stepInto = null
        stepIntoEvent = undefined
      }
    }
    if (expanded.includes(key) === opening && !loads.has(key)) {
      return false
    }
    if (opening && needsLoad(key)) {
      return load(key, why)
    }
    const changed = setExpanded(
      opening ? [...expanded, key] : expanded.filter((other) => other !== key),
      why
    )
    if (
      changed &&
      typeof document !== "undefined" &&
      itemElement(key) === document.activeElement
    ) {
      say(opening ? "expanded" : "collapsed", key)
    }
    return changed
  }

  // Expands a branch and everything in it that's known, and anything in it that renders later.
  function expandDeep(key: string, why: Why<TreeExpandedChangeReason>) {
    deep.add(key)
    deepWhy = why
    const below = shape()
      .descendants(key)
      .filter((child) => isBranch(child) && !needsLoad(child))
    const changed = setExpanded(
      [...store.get().expanded, ...(needsLoad(key) ? [] : [key]), ...below],
      why
    )
    if (needsLoad(key)) {
      load(key, why)
    }
    return changed
  }

  function collapseDeep(key: string, why: Why<TreeExpandedChangeReason>) {
    const below = new Set([key, ...shape().descendants(key)])
    for (const branch of below) {
      deep.delete(branch)
    }
    return setExpanded(
      store.get().expanded.filter((other) => !below.has(other)),
      why
    )
  }

  // Branches that render inside one expanded deeply expand too, once per batch.
  let deepQueued: string[] = []
  function queueDeep(key: string) {
    if (!deepQueued.length) {
      queueMicrotask(() => {
        const keys = deepQueued.filter(
          (branch) =>
            !store.get().expanded.includes(branch) && !needsLoad(branch)
        )
        deepQueued = []
        if (keys.length) {
          setExpanded([...store.get().expanded, ...keys], deepWhy)
        }
      })
    }
    deepQueued.push(key)
  }

  // With one item selectable, automatic activation selects wherever a key moves focus.
  function follow(key: string, event?: KeyboardEvent) {
    const { mode, activation } = store.get()
    if (mode === "single" && activation === "automatic") {
      selection.choose(key, { reason: "list-navigation", event })
    }
  }

  // Focus waiting for a loading branch's first child, which takes it once it's in the page.
  function focusLandedChild() {
    if (stepInto === null || loads.has(stepInto)) {
      return
    }
    const parent = stepInto
    const child = roving.items().find((item) => parentOf(item.key) === parent)
    if (child) {
      // Selects only while focus still waits on the branch, not once the user moved on or left.
      const from = itemElement(parent)
      // A shadow root's own activeElement, since the document's is its host.
      const stayed =
        !!from &&
        (from.getRootNode() as Document | ShadowRoot).activeElement === from
      stepInto = null
      child.el.focus()
      if (stayed) {
        follow(child.key, stepIntoEvent)
      }
      stepIntoEvent = undefined
    }
  }

  function setChecked(checked: string[], why: Why<TreeCheckedChangeReason>) {
    return change("checked", checked, why)
  }

  function toggleChecked(key: string, why: Why<TreeCheckedChangeReason>) {
    const state = store.get()
    if (!state.checkable || isDisabled(state, key)) {
      return false
    }
    const next = toggleTreeChecked(shape(), state.checked, key, {
      strategy: state.checkStrategy,
      checkable: (other) => !isDisabled(state, other),
    })
    return setChecked(next, why)
  }

  // An `onAction` Promise marks its item pending until it settles. Presses meanwhile are ignored.
  function act(key: string, event?: Event) {
    const action = options().onAction
    if (!action || store.get().pending.includes(key)) {
      return
    }
    const result = action(key, { event })
    if (!isPromise(result)) {
      return
    }
    store.set({ pending: [...store.get().pending, key] })
    const settled = () =>
      store.set({
        pending: store.get().pending.filter((other) => other !== key),
      })
    result.then(settled, settled)
  }

  // A press on an item, or Enter: focus, selection, expanding a branch, then `onAction`.
  function press(key: string, el: HTMLElement | undefined, event?: Event) {
    const state = store.get()
    const active =
      typeof document === "undefined" ? null : document.activeElement
    // A text field inside the item, like a rename, keeps focus.
    const editing =
      active instanceof HTMLElement &&
      active !== el &&
      (active.isContentEditable || active.matches("input, textarea, select"))
    if (el && active !== el && !editing) {
      el.focus({ preventScroll: true })
    }
    if (state.active !== key) {
      roving.remember(key)
    }
    if (isDisabled(state, key) || state.pending.includes(key)) {
      return
    }
    const mouse = event as MouseEvent | undefined
    const why = { reason: "item-press" as const, event }
    if (state.mode === "multiple" && mouse?.shiftKey) {
      selection.extend(key, { ...why, from: state.active })
    } else if (state.mode === "multiple" || mouse?.ctrlKey || mouse?.metaKey) {
      selection.toggle(key, why)
    } else {
      selection.choose(key, why)
    }
    if (isBranch(key) && state.expandOnPress) {
      setOpen(key, !state.expanded.includes(key), why)
    }
    act(key, event)
  }

  function keydown(
    event: KeyboardEvent,
    el: HTMLElement | undefined,
    key: string
  ) {
    if (!el || event.defaultPrevented) {
      return
    }
    const state = store.get()
    const mod = event.ctrlKey || event.metaKey
    wanted = undefined
    const moved = roving.keydown(event, el)
    // A row that shows but isn't rendered, like in a virtualized list, takes focus once it is.
    const target =
      moved?.key ??
      (wanted !== undefined && wanted !== key ? wanted : undefined)
    if (target !== undefined) {
      if (!moved) {
        event.preventDefault()
        roving.focus(target)
      }
      const index = visibleKeys().indexOf(target)
      options().onHighlight?.(target, { index, event })
      const homeOrEnd = event.key === "Home" || event.key === "End"
      const why = { reason: "list-navigation" as const, event }
      if (state.mode === "multiple" && event.shiftKey && (!homeOrEnd || mod)) {
        selection.extend(target, { ...why, from: key })
      } else if (!event.shiftKey) {
        follow(target, event)
      }
      return
    }
    if (wanted !== undefined) {
      return
    }
    const rtl = isRTL(el)
    const forward = rtl ? "ArrowLeft" : "ArrowRight"
    const backward = rtl ? "ArrowRight" : "ArrowLeft"
    const branch = isBranch(key)
    const expanded = branch && state.expanded.includes(key)
    const disabled = isDisabled(state, key)
    const nav = { reason: "list-navigation" as const, event }
    if (event.key === forward && !mod) {
      if (!branch) {
        return
      }
      if (event.altKey) {
        if (!disabled) {
          expandDeep(key, nav)
        }
      } else if (!expanded) {
        if (disabled) {
          return
        }
        if (loads.has(key)) {
          stepInto = key
          stepIntoEvent = event
        } else {
          setOpen(key, true, nav)
        }
      } else {
        const child = roving.items().find((item) => parentOf(item.key) === key)
        const first = child?.key ?? fromData()?.tree.children(key)[0]
        if (child) {
          child.el.focus()
          options().onHighlight?.(child.key, {
            index: visibleKeys().indexOf(child.key),
            event,
          })
        } else if (first !== undefined) {
          roving.focus(first)
        }
        if (first !== undefined) {
          follow(first, event)
        }
      }
    } else if (event.key === backward && !mod) {
      if (branch && event.altKey && !disabled) {
        collapseDeep(key, nav)
      } else if (expanded && !disabled) {
        setOpen(key, false, nav)
      } else {
        const parent = parentOf(key)
        if (parent === null) {
          return
        }
        if (itemElement(parent)) {
          itemElement(parent)!.focus()
        } else {
          roving.focus(parent)
        }
        options().onHighlight?.(parent, {
          index: visibleKeys().indexOf(parent),
          event,
        })
        follow(parent, event)
      }
    } else if (event.key === "*") {
      const parent = parentOf(key)
      const siblings = shape()
        .children(parent)
        .filter(
          (sibling) =>
            isBranch(sibling) &&
            !isDisabled(state, sibling) &&
            !needsLoad(sibling)
        )
      setExpanded([...state.expanded, ...siblings], nav)
    } else if (
      mod &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "a"
    ) {
      if (state.mode !== "multiple") {
        return
      }
      selection.toggleAll(nav)
    } else if (event.key === "Enter" && !mod && !event.altKey) {
      // A link label navigates, and its click presses the item.
      const label = context.element("label", key)
      if (label?.matches("a[href]")) {
        label.click()
      } else {
        press(key, el, event)
      }
    } else if (event.key === " " && !typeahead.active()) {
      const why = { reason: "item-press" as const, event }
      if (state.checkable) {
        toggleChecked(key, why)
      } else if (state.mode === "multiple" && event.shiftKey) {
        selection.extend(key, { ...why, from: key })
      } else if (state.mode !== "none") {
        selection.toggle(key, why)
      } else {
        return
      }
    } else if (isTypeaheadKey(event)) {
      const keys = fromData()
        ? visibleKeys()
        : roving.items().map((item) => item.key)
      const found = typeahead(event.key, keys.map(labelText), keys.indexOf(key))
      if (found === -1) {
        return
      }
      const to = keys[found]
      if (itemElement(to)) {
        itemElement(to)!.focus()
      } else {
        roving.focus(to)
      }
      options().onHighlight?.(to, { index: found, event })
      follow(to, event)
    } else {
      return
    }
    event.preventDefault()
  }

  const imperative = <Reason extends string>(
    why?: TreeChangeOptions<Reason>
  ) => ({
    reason: (why?.reason ?? "imperative") as Reason,
    event: why?.event,
  })

  const api = {
    id,
    roving,
    getExpanded: () => store.get().expanded,
    setExpanded: (
      expanded: string[],
      why?: TreeChangeOptions<TreeExpandedChangeReason>
    ) => setExpanded(expanded, imperative(why)),
    isExpanded: (value: string) => store.get().expanded.includes(value),
    expand: (
      value: string,
      why?: TreeChangeOptions<TreeExpandedChangeReason>
    ) => setOpen(value, true, imperative(why)),
    collapse: (
      value: string,
      why?: TreeChangeOptions<TreeExpandedChangeReason>
    ) => setOpen(value, false, imperative(why)),
    toggle: (
      value: string,
      why?: TreeChangeOptions<TreeExpandedChangeReason>
    ) => setOpen(value, !store.get().expanded.includes(value), imperative(why)),
    expandAll(why?: TreeChangeOptions<TreeExpandedChangeReason>) {
      deepAll = true
      deepWhy = imperative(why)
      const branches = shape()
        .keys()
        .filter((key) => isBranch(key) && !needsLoad(key))
      return setExpanded([...store.get().expanded, ...branches], deepWhy)
    },
    collapseAll(why?: TreeChangeOptions<TreeExpandedChangeReason>) {
      deepAll = false
      deep.clear()
      return setExpanded([], imperative(why))
    },
    getValue: () => store.get().value,
    setValue: (
      value: string | string[] | null,
      why?: TreeChangeOptions<TreeValueChangeReason>
    ) => setValue(value, imperative(why)),
    getChecked: () => store.get().checked,
    setChecked: (
      checked: string[],
      why?: TreeChangeOptions<TreeCheckedChangeReason>
    ) => setChecked(checked, imperative(why)),
    checkedState: (value: string) => store.get().checks[value] ?? false,
    reveal(value: string) {
      const land = () => {
        const index = visibleKeys().indexOf(value)
        if (index !== -1) {
          options().onHighlight?.(value, { index })
        }
        roving.focus(value)
        queueMicrotask(() =>
          itemElement(value)?.scrollIntoView?.({ block: "nearest" })
        )
      }
      const before = store.get().expanded
      const hidden = ancestors(value).filter(
        (ancestor) => !before.includes(ancestor)
      )
      if (
        hidden.length &&
        !setExpanded([...before, ...hidden], { reason: "imperative" })
      ) {
        return
      }
      if (shows(value, store.get().expanded)) {
        return land()
      }
      // A controlled tree expands once its `expanded` comes back, and its groups show a moment later.
      const stop = store.subscribe(() => {
        const { expanded } = store.get()
        if (expanded === before) {
          return
        }
        stop()
        if (shows(value, expanded)) {
          queueMicrotask(land)
        }
      })
    },
    focus: (value?: string) => roving.focus(value),
    internal: {
      mode: () => store.get().mode,
      isBranch,
      isDisabled,
      // An item's depth, from data, or from the parents its props name.
      level(key: string, props = itemProps(key)) {
        const known = fromData()
        if (known?.tree.has(key)) {
          return known.tree.level(key)
        }
        let level = 1
        const seen = new Set([key])
        for (
          let up = props?.parent ?? null;
          up !== null && !seen.has(up);
          up = itemProps(up)?.parent ?? null
        ) {
          seen.add(up)
          level++
        }
        return level
      },
      // With data, every item's place among its siblings, which renders on the server.
      dataPosition(key: string) {
        const known = fromData()
        return known?.tree.has(key) ? known.tree.position(key) : undefined
      },
      // Without data, its place among the items in the page.
      composedPosition(
        siblings: Record<string, number>,
        key: string,
        props: TreeItemProps
      ) {
        const parent = props.parent ?? ""
        const order = siblingOrder(parent, siblings[parent] ?? 0)
        const index = order.index.get(key)
        return index === undefined ? undefined : { index, size: order.size }
      },
      tabIndex: (state: TreeStore, part: Item) =>
        !state.focusableWhenDisabled && isDisabled(state, part.key, part.props)
          ? "-1"
          : roving.tabIndex(state, part),
      // The items a data tree renders.
      items: () => fromData()?.items,
      press,
      keydown,
      pressIndicator(key: string, event?: Event) {
        // The item's press would toggle it again.
        event?.preventDefault()
        const state = store.get()
        if (isDisabled(state, key)) {
          return
        }
        if (state.active !== key) {
          roving.remember(key)
        }
        const why = { reason: "trigger-press" as const, event }
        const expanded = state.expanded.includes(key)
        if ((event as MouseEvent | undefined)?.altKey) {
          expanded ? collapseDeep(key, why) : expandDeep(key, why)
        } else {
          setOpen(key, !expanded, why)
        }
      },
      pressCheckbox(key: string, event?: Event) {
        // The checkbox doesn't select or run the item.
        event?.preventDefault()
        const el = itemElement(key)
        if (el && document.activeElement !== el) {
          el.focus({ preventScroll: true })
        }
        toggleChecked(key, { reason: "item-press", event })
      },
      bindItem(el: HTMLElement, part: Item) {
        const cleanups = [roving.bind(el, part), recovery.bind(el, part)]
        const parent = part.props.parent ?? ""
        let siblings = byParent.get(parent)
        if (!siblings) {
          byParent.set(parent, (siblings = new Set()))
        }
        siblings.add(part.key)
        boundParent.set(el, parent)
        bumpSiblings(parent)
        bump()
        if (isBranch(part.key, part.props) && inDeep(part.key)) {
          queueDeep(part.key)
        }
        return () => {
          cleanups.forEach((cleanup) => cleanup())
          siblings.delete(part.key)
          boundParent.delete(el)
          bumpSiblings(parent)
          bump()
        }
      },
      bindRoot(el: HTMLElement) {
        if (typeof MutationObserver === "undefined") {
          return
        }
        // Only a move needs this, like a sorted folder; items joining and leaving bump on their own.
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              const parent = boundParent.get(node as Element)
              if (parent === undefined) {
                continue
              }
              bumpSiblings(parent)
              bump()
            }
          }
        })
        observer.observe(el, { childList: true, subtree: true })
        return () => observer.disconnect()
      },
      // The group's enter and exit animations. A group in the page from the first render doesn't animate in.
      bindGroup(
        el: HTMLElement,
        key: string,
        isFindable: () => boolean,
        part: Part
      ) {
        // Open before any item bound means it rendered open with the page.
        let initial =
          store.get().active === null && store.get().expanded.includes(key)
        let found = false
        return bindPanel(el, {
          size: (el, height) =>
            el.style.setProperty("--tree-group-height", height),
          isOpen: () => store.get().expanded.includes(key),
          isExiting: () => store.get().exiting.includes(key),
          isFindable,
          opening: () => (initial ? "mount" : found ? "instant" : "animate"),
          reveal(event) {
            found = true
            setOpen(key, true, { reason: "find-in-page", event })
          },
          trigger: () => itemElement(key),
          subscribe: (listener) =>
            stateAndRenders(
              store,
              part
            )(() => {
              if (!store.get().expanded.includes(key)) {
                initial = false
              }
              listener()
            }),
          settled: () => {
            initial = found = false
          },
          exited: () =>
            store.set({
              exiting: store.get().exiting.filter((other) => other !== key),
            }),
        })
      },
    },
  }
  return api
}

const treeApi: (...args: Parameters<typeof treeApiBody>) => TreeApi =
  treeApiBody

export { type TreeApi, treeApi, type TreeStore }
