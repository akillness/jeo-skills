// Parts the listbox components share, as slot definitions and attribute
// helpers: the form-associated root, the hidden inputs a form submits, item
// registration, the check inside an item, groups and their labels,
// separators, the empty and status messages of a filtered list, and the arrow.
import { warn } from "#dev"
import { type AsyncOptionsStatus } from "./async-options"
import { keyWhileBound } from "../kernel/bound-keys"
import { isBrowser } from "../platform/env"
import { animateIn } from "../motion/presence"
import {
  bindInternals,
  bindValueInput,
  hiddenInputStyle,
  isDisabled,
  labelsOf,
  nameFromLabels,
  valueMissingMessage,
} from "../forms/form"
import {
  type ListData,
  type ListEmptyState,
  type ListStatusState,
  type Listbox,
} from "./listbox"
import { idPart, openAttrs } from "../kernel/attrs"
import type {
  BaseSlotProps,
  RoleFields,
  SlotDefinition,
} from "../kernel/primitive-types"
import type { Store } from "../kernel/store"
import { type ValueSelection } from "./listbox-value"

// What a listbox component's state holds for its form and its parts.
type ListboxState = FormState & { open: boolean }

// What a control holding listbox values keeps for its form.
type FormState = {
  value: unknown
  multiple: boolean
  disabled: boolean
  formDisabled: boolean
  readOnly: boolean
  required: boolean
  name: string | undefined
  form: string | undefined
  autoComplete?: string
}

// What a listbox component's api gives the shared parts.
type ListboxApi = {
  focus: () => void
  internal: {
    listbox: Listbox
    selection: ValueSelection
    keyOf: (value: unknown) => string
    // The element that stands for the whole control: a select's trigger, a combobox's input.
    controlElement: () => HTMLElement | undefined
    itemProps: (key: string) => ItemMeta | undefined
    restore: (saved: string) => void
    reset: () => void
    setFormDisabled: (disabled: boolean) => void
    // Picks the item a browser's autofill wrote. Without it, the input only writes the value back.
    autofill?: (text: string) => void
  }
}

// The props an item registers with.
type ItemMeta = {
  value: unknown
  label?: string
  keywords?: string[]
  disabled?: boolean
  group?: string
  index?: number
}

type IndicatorProps = { item?: string; keepMounted?: boolean }

// The data list a part shows while there are no items, one array so its identity never changes.
const noItems: ListData<unknown> = []

// The keys `listStep` moves by. Control+N and Control+P step only on Apple platforms.
const listStepKeys = [
  "ArrowDown",
  "ArrowUp",
  "PageDown",
  "PageUp",
  "ctrl+n",
  "ctrl+p",
] as const

// Disabled or read-only: nothing can be cleared or removed.
const isLocked = (state: {
  disabled: boolean
  formDisabled: boolean
  readOnly: boolean
}) => isDisabled(state) || state.readOnly

// The form state every part of the control reflects.
const formAttrs = (
  state: Pick<
    ListboxState,
    "disabled" | "formDisabled" | "readOnly" | "required"
  >
) => ({
  "data-disabled": isDisabled(state) ? "" : undefined,
  "data-readonly": state.readOnly ? "" : undefined,
  "data-required": state.required ? "" : undefined,
})

// Web components can't skip rendering a part's content, like an empty
// message: it waits outside the page while `shown` is false. Returns a cleanup
// that puts it back.
function stashContent(
  el: HTMLElement,
  shown: () => boolean,
  subscribe: (listener: () => void) => () => void
) {
  const stash = el.ownerDocument.createDocumentFragment()
  const write = () => {
    if (shown() && stash.childNodes.length) {
      el.append(stash)
    } else if (!shown() && el.childNodes.length) {
      stash.append(...Array.from(el.childNodes))
    }
  }
  write()
  const unsubscribe = subscribe(write)
  return () => {
    unsubscribe()
    if (stash.childNodes.length) {
      el.append(stash)
    }
  }
}

// Warns when the control has no accessible name once its labels have had
// time to connect. Not `checkName`, since a combobox role takes no name from
// its content: only a label, `aria-label` or `aria-labelledby` name it.
// `named` checks names the element can't show, like a label part. Call it
// behind `if (dev)`, so production builds drop the timer too.
function warnIfUnnamed(
  el: HTMLElement,
  message: string,
  from: { component: string; id: string },
  named: () => boolean = () => false
) {
  if (!isBrowser) {
    return
  }
  setTimeout(() => {
    if (
      !el.isConnected ||
      named() ||
      el.getAttribute("aria-labelledby") ||
      el.getAttribute("aria-label") ||
      labelsOf(el).length
    ) {
      return
    }
    warn(message, from)
  }, 300)
}

// An item's place among all items, for virtualized lists that render only some.
function positionAttrs(index: number | undefined, listbox: Listbox) {
  if (index === undefined) {
    return {}
  }
  return {
    "aria-posinset": String(index + 1),
    "aria-setsize": String(listbox.entries().length),
  }
}

// What a list with an input needs from its component for the shared parts:
// the engine, the latest props of an item, the text it filters by, and
// whether nothing matches.
type OptionListApi = {
  internal: {
    listbox: Listbox
    itemProps: (key: string) => ItemMeta | undefined
    filterQuery: () => string
    isEmpty: (state: never) => boolean
    itemCount: () => number
  }
}

type OptionListState = {
  items: ListData<unknown> | undefined
  status: AsyncOptionsStatus
  query: string
}

// Registers an item with the listbox, reading its latest props live, so a
// changed label or disabled state applies at once.
function registerItem(
  el: HTMLElement,
  {
    api,
    key,
    props,
  }: {
    api: { internal: Pick<OptionListApi["internal"], "listbox" | "itemProps"> }
    key: string
    props: ItemMeta
  }
) {
  return api.internal.listbox.register(key, el, () => {
    const latest = api.internal.itemProps(key) ?? props
    return {
      value: latest.value,
      label: latest.label,
      keywords: latest.keywords,
      disabled: latest.disabled,
      group: latest.group,
      index: latest.index,
    }
  })
}

// Registers an item, and a selected item's label shows in the value once it's known.
function bindItem(
  el: HTMLElement,
  { api, key, props }: { api: ListboxApi; key: string; props: ItemMeta }
) {
  const unregister = registerItem(el, { api, key, props })
  if (api.internal.selection.isSelected(key, props.value)) {
    api.internal.selection.queueLabels()
  }
  return unregister
}

// A group of items, named by its label, and hidden while none of its items match.
function optionGroupPart<
  State extends GroupLabelsState,
  Api extends { internal: { listbox: Listbox } },
>() {
  return {
    // Its id is made for it, and names the group its items and label are in.
    props: { id: "id" },
    role: "group",
    attrs: (state, { id, key, api }) => ({
      "aria-labelledby": groupLabelledBy(state, id, key),
      hidden: api.internal.listbox.groupMatches(key) ? undefined : "",
    }),
  } satisfies SlotDefinition<State, Api, BaseSlotProps, {}> &
    RoleFields<State, Api, BaseSlotProps>
}

// A group is named by its label only while one is in the page, so an
// unlabeled group points at no missing id.
const groupLabelledBy = (state: GroupLabelsState, id: string, group: string) =>
  state.groupLabels.includes(group) ? `${id}-group-${idPart(group)}` : undefined

type GroupLabelsState = { groupLabels: readonly string[] }

// A listbox may only hold options and groups, so separators are hidden from
// assistive technology. Composed separators hide while the list is filtered.
function optionSeparatorPart<
  State extends OptionListState,
  Api extends OptionListApi,
>() {
  return {
    role: "none",
    attrs: (state, { api }) => ({
      "aria-hidden": "true",
      hidden: api.internal.filterQuery() && !state.items ? "" : undefined,
    }),
  } satisfies SlotDefinition<State, Api, BaseSlotProps, {}> &
    RoleFields<State, Api, BaseSlotProps>
}

type EmptyProps = {
  /** @internal Hides the message while the list has items, for web components that can't skip rendering it. */
  stash?: boolean
}

// Shown while no item matches. It stays in the page, so its message is announced when it appears.
function emptyPart<State extends OptionListState, Api extends OptionListApi>() {
  const isEmpty = (state: State, api: Api) =>
    (api.internal.isEmpty as (state: State) => boolean)(state)
  return {
    // Internal: passed by renderers.
    props: { stash: "boolean" },
    state: (state, { api }) => ({
      loading: state.status === "loading",
      empty: isEmpty(state, api),
      query: state.query,
    }),
    role: "status",
    attrs: (state, { api }) => ({
      "aria-live": "polite",
      "aria-atomic": "true",
      "data-empty": isEmpty(state, api) ? "" : undefined,
      "data-loading": state.status === "loading" ? "" : undefined,
    }),
    bind(el, { api, store, props }) {
      if (props.stash) {
        return stashContent(
          el,
          () => isEmpty(store.get(), api),
          store.subscribe
        )
      }
    },
  } satisfies SlotDefinition<
    State,
    Api,
    EmptyProps & BaseSlotProps,
    ListEmptyState
  > &
    RoleFields<State, Api, EmptyProps & BaseSlotProps>
}

// A polite live region for loading and result counts. Its content is yours.
function statusPart<
  State extends OptionListState,
  Api extends OptionListApi,
>() {
  return {
    state: (state, { api }) => ({
      status: state.status,
      loading: state.status === "loading",
      count: api.internal.itemCount(),
    }),
    role: "status",
    attrs: (state) => ({
      "aria-live": "polite",
      "aria-atomic": "true",
      "data-loading": state.status === "loading" ? "" : undefined,
    }),
  } satisfies SlotDefinition<State, Api, BaseSlotProps, ListStatusState> &
    RoleFields<State, Api, BaseSlotProps>
}

// Web components only: the control's own element, which takes part in forms.
function rootPart<State extends ListboxState, Api extends ListboxApi>({
  focusOnSelfClick,
}: {
  // Whether a click on the element itself, like from a label pointing at it, focuses the control.
  focusOnSelfClick: boolean
}) {
  return {
    attrs: (state) => ({ ...formAttrs(state), ...openAttrs(state.open) }),
    bind: (el, context) => bindFormRoot(el, context, { focusOnSelfClick }),
  } satisfies SlotDefinition<State, Api, BaseSlotProps, {}>
}

// Reports a form-associated element's value and validity, for web components,
// and names its control from the labels pointing at it. Elements without
// ElementInternals, like a React listbox, only get the labels.
function bindFormRoot<State extends FormState, Api extends ListboxApi>(
  el: HTMLElement,
  { api, store }: { api: Api; store: Store<State> },
  { focusOnSelfClick }: { focusOnSelfClick: boolean }
) {
  const { selection } = api.internal
  const unbind = bindInternals(el, {
    value: () => {
      const keys = selection.keys()
      return store.get().multiple ? keys : (keys[0] ?? null)
    },
    name: () => store.get().name,
    state: () => JSON.stringify(selection.keys()),
    restore: api.internal.restore,
    valueMissing: () => store.get().required && selection.keys().length === 0,
    message: () => valueMissingMessage("select"),
    anchor: api.internal.controlElement,
    focus: api.focus,
    reset: api.internal.reset,
    disabled: api.internal.setFormDisabled,
    subscribe: store.subscribe,
  })
  // Labels pointing at the element name its control, and pressing them focuses it.
  let unname = () => {}
  queueMicrotask(() => {
    const control = api.internal.controlElement()
    if (control) {
      unname = nameFromLabels(el, control)
    }
  })
  const onClick = (event: MouseEvent) => {
    if (event.target === el) {
      api.focus()
    }
  }
  if (focusOnSelfClick) {
    el.addEventListener("click", onClick)
  }
  return () => {
    unbind()
    unname()
    el.removeEventListener("click", onClick)
  }
}

// A visually hidden textarea that submits, resets, validates and autofills
// the value before hydration; a text input would stop Enter from submitting the
// form. With `multiple`, it only validates; each value has its own hidden input.
function hiddenInputPart<State extends FormState, Api extends ListboxApi>(
  slot: string
) {
  return {
    attrs: (state, { id, api }) => {
      const keys = api.internal.selection.keysOf(state.value)
      return {
        id: `${id}-${slot}`,
        name: state.multiple ? undefined : state.name,
        value: state.multiple ? keys.join(",") : (keys[0] ?? ""),
        form: state.form,
        autocomplete: state.autoComplete,
        required: state.required ? "" : undefined,
        disabled: state.disabled ? "" : undefined,
        "aria-hidden": "true",
        tabindex: "-1",
        style: hiddenInputStyle,
      }
    },
    bind: (el, { api, store }) =>
      bindValueInput(el as HTMLInputElement, {
        value: () => {
          const keys = api.internal.selection.keys()
          return store.get().multiple ? keys.join(",") : (keys[0] ?? "")
        },
        subscribe: store.subscribe,
        focus: api.focus,
        autofill: api.internal.autofill,
        reset: api.internal.reset,
        disabled: api.internal.setFormDisabled,
      }),
  } satisfies SlotDefinition<State, Api, BaseSlotProps, {}>
}

// One hidden input per selected value with `multiple`, keyed by the value.
function valueInputPart<State extends FormState, Api>() {
  return {
    props: { value: "string" },
    attrs: (state, { props }) => ({
      type: "hidden",
      name: state.name,
      value: props.value,
      form: state.form,
      disabled: isDisabled(state) ? "" : undefined,
    }),
  } satisfies SlotDefinition<State, Api, { value: string } & BaseSlotProps, {}>
}

// The check inside a selected item.
function itemIndicatorPart<State extends object, Api extends ListboxApi>() {
  return {
    // Its id is made for it, and its item is the one it's inside, which every
    // renderer fills in, so `item` is set by the time it's read.
    props: {
      item: { kind: "string", from: "item.value", required: true },
      keepMounted: "boolean",
      id: "id",
    },
    present: (state, { props, api }) =>
      !!props.keepMounted || api.internal.selection.isSelected(props.item!),
    state: (state, { props, api }) => ({
      selected: api.internal.selection.isSelected(props.item!),
    }),
    attrs: (state, { props, api }) => ({
      "aria-hidden": "true",
      "data-selected": api.internal.selection.isSelected(props.item!)
        ? ""
        : undefined,
    }),
    bind: (el, { api, props }) =>
      api.internal.selection.isSelected(props.item!)
        ? animateIn(el)
        : undefined,
  } satisfies SlotDefinition<
    State,
    Api,
    IndicatorProps & BaseSlotProps,
    { selected: boolean }
  >
}

function groupLabelPart<State extends GroupLabelsState, Api>() {
  return {
    // Its group is the one it's inside, which every renderer fills in. The
    // group's id keys it too, so labels of two groups are two parts.
    props: {
      id: { kind: "string", from: "group.id", required: true },
      group: { kind: "string", from: "group.id", required: true },
    },
    attrs: (state, { id, props }) => ({
      id: `${id}-group-${idPart(props.group!)}`,
    }),
    bind: (el, { store, props }) =>
      keyWhileBound(store, "groupLabels", props.group!),
  } satisfies SlotDefinition<State, Api, { group?: string } & BaseSlotProps, {}>
}

function arrowPart<
  State extends { open: boolean },
  Api extends { internal: { popup: { checkPlacement: () => void } } },
>() {
  return {
    state: (state) => ({ open: state.open }),
    attrs: (state) => ({ "aria-hidden": "true", ...openAttrs(state.open) }),
    // An arrow that binds after its list was placed points at the trigger at once.
    bind(_, { api }) {
      api.internal.popup.checkPlacement()
    },
  } satisfies SlotDefinition<State, Api, BaseSlotProps, { open: boolean }>
}

export {
  arrowPart,
  bindFormRoot,
  bindItem,
  emptyPart,
  formAttrs,
  groupLabelledBy,
  groupLabelPart,
  hiddenInputPart,
  isDisabled,
  isLocked,
  itemIndicatorPart,
  listStepKeys,
  noItems,
  optionGroupPart,
  optionSeparatorPart,
  positionAttrs,
  registerItem,
  rootPart,
  stashContent,
  statusPart,
  valueInputPart,
  warnIfUnnamed,
}
