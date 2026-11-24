// A "select all" option for lists with `multiple`, shared by Select and
// Combobox. It selects every item that matches what's typed and can be chosen,
// in its group or in the whole list, and unselects them once they all are. It
// reads as checked, unchecked or indeterminate, like a checkbox over the items.
import { pressKeepsFocus } from "../focus/press-keeps-focus"
import { textOf } from "../text/typeahead"
import { type Listbox } from "./listbox"
import { optionId, SELECT_ALL } from "./listbox-keys"
import { checkedAttrs } from "../kernel/attrs"
import type {
  BaseSlotProps,
  RoleFields,
  SlotDefinition,
} from "../kernel/primitive-types"
import { type ValueSelection } from "./listbox-value"
import { live } from "../kernel/live"

/** What a select-all option receives: how many of its items are selected. */
type ListSelectAllState = {
  /** Whether every item it covers is selected. */
  checked: boolean
  /** Whether some of its items are selected, but not all. */
  indeterminate: boolean
  /** Whether it's highlighted, by the keyboard or the pointer. */
  highlighted: boolean
  /** Whether it can't be used: nothing it covers can be chosen, or choosing them all would pass `maxSelected`. */
  disabled: boolean
}

// The group a select-all key covers, or undefined for the whole list.
const groupOf = (key: string) =>
  key === SELECT_ALL ? undefined : key.slice(SELECT_ALL.length + 1)

// What the select-all parts need from a component.
type SelectAllApi = {
  internal: {
    listbox: Listbox
    selection: ValueSelection
    // How many values may be selected, with `maxSelected`.
    limit?: () => number | undefined
    choose: (key: string, event?: Event) => void
    hover: (key: string, event: PointerEvent) => void
  }
}

// The items a select-all option covers, and how many are selected.
function coverage(
  { listbox, selection, limit }: SelectAllApi["internal"],
  key: string
) {
  const keys = listbox.selectable(groupOf(key))
  let selected = 0
  for (const item of keys) {
    if (selection.isSelected(item)) {
      selected++
    }
  }
  const max = limit?.()
  const fits =
    max === undefined || selection.keys().length + keys.length - selected <= max
  return { keys, selected, fits }
}

/** The state of a select-all option. */
function selectAllState(
  api: SelectAllApi,
  key: string,
  highlighted: string | null
) {
  const { keys, selected, fits } = coverage(api.internal, key)
  const checked = keys.length > 0 && selected === keys.length
  return {
    checked,
    indeterminate: selected > 0 && !checked,
    highlighted: highlighted === key,
    disabled: !keys.length || (!checked && !fits),
  }
}

// The value after pressing a select-all option: its items added, or removed
// once they're all selected. Undefined when it can't be used.
function toggledAll(api: SelectAllApi, key: string) {
  const { listbox, selection } = api.internal
  const { keys, selected, fits } = coverage(api.internal, key)
  if (!keys.length) {
    return undefined
  }
  if (selected === keys.length) {
    const removed = new Set(keys)
    return selection
      .values()
      .filter((value) => !removed.has(selection.keysOf([value])[0]))
  }
  if (!fits) {
    return undefined
  }
  const added = keys.filter((item) => !selection.isSelected(item))
  // Their labels outlive the list, for chips and the trigger.
  for (const item of added) {
    const entry = listbox.find(item)
    if (entry) {
      listbox.remember(item, entry.label, entry.value)
    }
  }
  return [...selection.values(), ...added.map((item) => listbox.valueOf(item))]
}

type SelectAllOwnerState = {
  multiple: boolean
  highlighted: string | null
  focusInList: boolean
}

type OptionFocus = "roving" | "active-descendant"

// What the select-all feature needs from a component, beyond its parts.
type SelectAllFeatureApi = SelectAllApi & {
  internal: {
    hooks: { choose?: (key: string, event?: Event) => void }
    changeValue: (
      value: unknown,
      details: { reason: "item-press"; event?: Event }
    ) => unknown
  }
}

/**
 * Select-all as a feature: the option, and what pressing it does. The
 * component calls the `choose` hook for a select-all key once it has checked
 * the value can change.
 */
function selectAllFeature<
  State extends SelectAllOwnerState,
  Api extends SelectAllFeatureApi,
>({ focus }: { focus: OptionFocus }) {
  return {
    slots: { "select-all": selectAllPart<State, Api>({ focus }) },
    extend(api: Api) {
      api.internal.hooks.choose = (key, event) => {
        const value = toggledAll(api, key)
        if (value) {
          api.internal.changeValue(value, { reason: "item-press", event })
        }
      }
    },
  }
}

// The option itself: checked, unchecked or mixed, never filtered and never
// counted as a result. It takes focus as the component's items do: real focus,
// or aria-activedescendant until a screen reader moves focus into the list.
function selectAllPart<
  State extends SelectAllOwnerState,
  Api extends SelectAllApi,
>({ focus }: { focus: OptionFocus }) {
  return {
    present: (state) => state.multiple,
    state: (state, { api, key }) => selectAllState(api, key, state.highlighted),
    role: "option",
    focus,
    attrs: (state, { id, api, key }) => {
      const { checked, indeterminate, disabled } = selectAllState(
        api,
        key,
        state.highlighted
      )
      return {
        id: optionId(id, key),
        tabindex: focus === "roving" || state.focusInList ? "-1" : undefined,
        "aria-selected": String(checked),
        "aria-checked": checked ? "true" : indeterminate ? "mixed" : "false",
        "aria-disabled": disabled ? "true" : undefined,
        "data-disabled": disabled ? "" : undefined,
        ...checkedAttrs(indeterminate ? "indeterminate" : checked),
      }
    },
    live: live((state, { key }) => ({
      "data-highlighted": state.highlighted === key ? "" : undefined,
    })),
    on: {
      ...pressKeepsFocus,
      pointermove: (event, { api, key }) => api.internal.hover(key, event),
    },
    press: ({ api, key }, event) => api.internal.choose(key, event),
    bind: (el, { api, key }) =>
      api.internal.listbox.register(key, el, () => ({
        value: key,
        label: textOf(el),
        pinned: true,
      })),
  } satisfies SlotDefinition<State, Api, BaseSlotProps, ListSelectAllState> &
    RoleFields<State, Api, BaseSlotProps>
}

export { type ListSelectAllState, selectAllFeature }
