// Single and multiple selection over string keys: choosing, toggling, Shift
// ranges from an anchor and toggling everything, as a listbox, a tree or a
// grid selects. Listbox runs on `createKeySelection`; `createSelection` is the
// same model for a custom primitive's own state key.
import type { PrimitiveContext, ReasonFor } from "../kernel/primitive-types"
import {
  allToggled,
  rangeSelection,
  isSameKeys,
  toggledKeys,
  type RangeAnchor,
} from "./listbox-range"

// Why a selection changed, passed on to the change it asks for.
type Why<Reason extends string> = { reason: Reason; event?: Event }

// The model on keys it reads and writes through callbacks. `set` returns
// whether the change went through, so a refused one moves no anchor.
function createKeySelection<Reason extends string>(config: {
  keys: () => readonly string[]
  set: (keys: string[], why: Why<Reason>) => boolean
  order: () => readonly string[]
  selectable: (key: string) => boolean
}) {
  const { keys, set, order, selectable } = config
  // Where Shift ranges start, set by every choice made without Shift.
  let anchor: RangeAnchor | null = null

  return {
    toggle(key: string, why: Why<Reason>) {
      if (!selectable(key)) {
        return
      }
      const next = toggledKeys(keys(), key)
      if (set(next, why)) {
        anchor = { key, base: next }
      }
    },
    replace(key: string, why: Why<Reason>) {
      if (!selectable(key)) {
        return
      }
      if (!isSameKeys(keys(), [key]) && !set([key], why)) {
        return
      }
      anchor = { key, base: [key] }
    },
    // Selects from the anchor to `to`. Without an anchor, the range starts at
    // `from`, the item focus was on, or at `to` itself.
    extend(
      to: string,
      { from, additive }: { from: string | null; additive: boolean },
      why: Why<Reason>
    ) {
      const list = order()
      if (!anchor || !list.includes(anchor.key)) {
        anchor = { key: from ?? to, base: keys() }
      }
      const next = rangeSelection(list, anchor, to, { additive, selectable })
      if (!isSameKeys(next, keys())) {
        set(next, why)
      }
    },
    toggleAll(why: Why<Reason>) {
      const next = allToggled(keys(), order().filter(selectable))
      if (!isSameKeys(next, keys())) {
        set(next, why)
      }
    },
    anchor: () => anchor?.key ?? null,
    setAnchor(key: string | null) {
      anchor = key === null ? null : { key, base: [...keys()] }
    },
    resetAnchor() {
      anchor = null
    },
  }
}

// Outside state may hand the same keys back as a new array, or in another order.
function sameMembers(a: readonly string[], b: readonly string[]) {
  const members = new Set(b)
  return a.length === b.length && a.every((key) => members.has(key))
}

/**
 * How `createSelection` reads and changes a selection.
 * @stable
 */
type SelectionOptions<Key extends string, Reason extends string> = {
  /** The state key that holds the selected keys, a `string[]`. */
  key: Key
  /**
   * Asks for a new selection and returns whether it went through. Pass the
   * primitive's change, so `on<Key>Change`, `cancel()` and controlled values
   * work: `set: (value, details) => change("value", value, details)`.
   */
  set: (value: string[], details: Why<Reason>) => boolean
  /** Every key in list order, for ranges and select all, like the visible items' keys. */
  order: () => readonly string[]
  /** Whether more than one item can be selected. Defaults to `false`. */
  multiple?: () => boolean
  /** Whether a key can be chosen, toggled, or added to a range. Replacing the selection can still remove it. Defaults to every item. */
  selectable?: (key: string) => boolean
}

/**
 * The selection rules of a listbox, for any collection whose selection is a
 * `string[]` in state: `choose` selects one item, `toggle` adds or removes one
 * (Ctrl+click, Space), `extend` selects a Shift range from the anchor, and
 * `toggleAll` is Ctrl+A. Every choice without Shift moves the anchor. A
 * selection set from outside, like a controlled value or a controller, starts
 * ranges over. In single mode, `toggle` unselects the selected item, and
 * `extend` and `toggleAll` choose.
 *
 * ```ts
 * const change = createChange(context)
 * const selection = createSelection(context, {
 *   key: "value",
 *   set: (value, details) => change("value", value, details),
 *   order: () => roving.items().map((item) => item.key),
 *   multiple: () => !!context.options().multiple,
 * })
 * selection.extend(key, { reason: "item-press", event })
 * ```
 * @stable
 */
function createSelection<
  Options,
  State extends object,
  Key extends keyof State & string,
  // Typed from the options' `on<Key>Change`, so `set` passes the reasons straight to `change`.
  Reason extends string = ReasonFor<Options, Key>,
>(
  context: Pick<
    PrimitiveContext<Options, State, any>,
    "store" | "options" | "onDestroy"
  >,
  options: SelectionOptions<Key, Reason>
) {
  const { store } = context
  const keys = () =>
    (store.get()[options.key] as readonly string[] | undefined) ?? []
  const multiple = () => options.multiple?.() ?? false
  const selectable = (key: string) => options.selectable?.(key) ?? true
  // The keys this selection last asked for, so a controlled value coming back is known as its own.
  let requested: string[] | null = null
  const model = createKeySelection<Reason>({
    keys,
    order: options.order,
    selectable,
    set(next, why) {
      requested = next
      const done = options.set(next, why)
      if (!done) {
        requested = null
      }
      return done
    },
  })

  let previous = keys()
  context.onDestroy(
    store.subscribe(() => {
      const current = keys()
      if (current === previous) {
        return
      }
      const kept = sameMembers(current, previous)
      previous = current
      if (kept) {
        return
      }
      const own = requested !== null && sameMembers(requested, current)
      requested = null
      if (!own || !current.length) {
        model.resetAnchor()
      }
    })
  )

  return {
    /** Whether an item is selected. */
    isSelected: (key: string) => keys().includes(key),
    /** Selects only this item, and starts the next range there. */
    choose: (key: string, why: Why<Reason>) => model.replace(key, why),
    /** Adds or removes one item, and starts the next range there. In single mode, selects it or clears it. */
    toggle(key: string, why: Why<Reason>) {
      if (multiple()) {
        return model.toggle(key, why)
      }
      if (!selectable(key)) {
        return
      }
      if (isSameKeys(keys(), [key])) {
        model.toggle(key, why)
      } else {
        model.replace(key, why)
      }
    },
    /**
     * Selects the range from the anchor to `key`, keeping what was selected
     * when the anchor was set. Without an anchor, the range starts at `from`,
     * like the item focus was on. `additive: false` drops what was selected
     * before. In single mode, chooses `key`.
     */
    extend(
      key: string,
      why: Why<Reason> & { from?: string | null; additive?: boolean }
    ) {
      if (!multiple()) {
        return model.replace(key, why)
      }
      model.extend(
        key,
        { from: why.from ?? null, additive: why.additive ?? true },
        why
      )
    },
    /** Selects every selectable item in `order`, or none once they all are, like Ctrl+A. Only in multiple mode. */
    toggleAll(why: Why<Reason>) {
      if (multiple()) {
        model.toggleAll(why)
      }
    },
    /** The key ranges start from, or `null`. */
    anchor: model.anchor,
    /**
     * Starts the next range at `key` without changing the selection, like when
     * arrow keys move focus but don't select. The range keeps what's selected now. `null` clears it.
     */
    setAnchor: model.setAnchor,
  }
}

/**
 * What `createSelection` returns.
 * @stable
 */
type SelectionModel = ReturnType<typeof createSelection>

export {
  createKeySelection,
  createSelection,
  type SelectionModel,
  type SelectionOptions,
}
