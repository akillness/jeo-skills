// Select's parts and the attributes they carry.
import { dev } from "#dev"
import { popupContentAttrs } from "../../foundation/popups/popup"
import {
  ownsEvent,
  registerPopupElement,
} from "../../foundation/popups/popup-elements"
import { bindListContent } from "../../foundation/lists/listbox-popup"
import { holdFocus } from "../../foundation/focus/press-keeps-focus"
import {
  arrowPart,
  bindItem,
  emptyPart,
  formAttrs,
  groupLabelPart,
  hiddenInputPart,
  isDisabled,
  isLocked,
  itemIndicatorPart,
  noItems,
  optionGroupPart,
  optionSeparatorPart,
  listStepKeys,
  positionAttrs,
  rootPart,
  statusPart,
  valueInputPart,
  warnIfUnnamed,
} from "../../foundation/lists/listbox-parts"
import { flagWhileBound, settleFlag } from "../../foundation/kernel/bound-keys"
import { accessibleName } from "../../foundation/text/accessible-name"
import {
  itemIconsFeature,
  optionIcon,
  rememberIcon,
} from "../../foundation/lists/item-icon"
import {
  itemTextPart,
  type ListItemTextProps,
} from "../../foundation/lists/listbox-search"
import { selectAllFeature } from "../../foundation/lists/listbox-select-all"
import { idPart, openAttrs } from "../../foundation/kernel/attrs"
import type { SlotFactory } from "../../foundation/kernel/primitive-types"
import type {
  SelectArrowState,
  SelectClearProps,
  SelectClearState,
  SelectContentProps,
  SelectContentState,
  SelectInputState,
  SelectItemIndicatorProps,
  SelectItemIndicatorState,
  SelectItemProps,
  SelectItemState,
  SelectItemTextState,
  SelectTriggerProps,
  SelectTriggerState,
  SelectValueProps,
  SelectValueState,
} from "./select"
import { virtual, type SelectApi, type SelectState } from "./select-api"
import { formatLabels, listOf } from "../../foundation/lists/listbox-value"
import { bindPageLocale, localeOf } from "../../foundation/text/locale"
import { selects } from "../../foundation/kernel/selects"
import { direct, live } from "../../foundation/kernel/live"

type ValueProps = SelectValueProps & {
  /** @internal Writes the label as text, for web components without their own content. */
  text?: boolean
}

type ItemProps = SelectItemProps<unknown> & {
  /** @internal The group the item is in. */
  group?: string
}

type IndicatorProps = SelectItemIndicatorProps & {
  /** @internal The key of the item the indicator is in. */
  item?: string
}

const hasValue = (state: SelectState) => listOf(state.value).length > 0

// What adapters pass on top: whether a Field or the trigger's own `aria-labelledby` names it.
type TriggerProps = Omit<SelectTriggerProps, "controller"> & { named?: boolean }

function triggerState(state: SelectState, props: TriggerProps) {
  return {
    open: state.open,
    disabled: isDisabled(state) || !!props.disabled,
    readOnly: state.readOnly,
    required: state.required,
    placeholder: !hasValue(state),
  }
}

function itemState(
  state: SelectState,
  key: string,
  props: ItemProps,
  api: SelectApi
) {
  return {
    highlighted: state.highlighted === key,
    selected: api.internal.selection.isSelected(key, props.value),
    disabled: !!props.disabled,
  }
}

function contentState(state: SelectState, { api }: { api: SelectApi }) {
  return {
    open: state.open,
    presentation: state.presentation,
    multiple: state.multiple,
    items: api.internal.listbox.visibleData()?.list ?? noItems,
    status: state.status,
  }
}

// A list that points at its trigger is named after the value the trigger
// shows (accname 1.2, step 2E), so an open one copies the trigger's name, once
// `labeled` settles. Closed it has no name, so a query by label finds the trigger alone.
function listName(state: SelectState, id: string, api: SelectApi) {
  if (state.labeled) {
    return { "aria-labelledby": `${id}-label` }
  }
  const trigger =
    state.open && state.labeled === false
      ? api.internal.triggerElement()
      : undefined
  const name = (trigger && accessibleName(trigger)) || undefined
  return {
    "aria-labelledby": name ? undefined : `${id}-trigger`,
    "aria-label": name,
  }
}

// An option shows the highlight and its own entry in the listing, which
// covers the query and the value. Every other key is named here, so a key the
// state gains later is a type error until someone decides whether options read it.
const unreadByItems = {
  open: [],
  mounted: [],
  value: [],
  initial: [],
  trigger: [],
  prepared: [],
  listed: [],
  labeled: [],
  multiple: [],
  disabled: [],
  readOnly: [],
  required: [],
  name: [],
  form: [],
  autoComplete: [],
  formDisabled: [],
  placeholder: [],
  items: [],
  labels: [],
  icons: [],
  pageLocale: [],
  query: [],
  searchable: [],
  focusInList: [],
  virtualFocus: [],
  status: [],
  mounts: [],
  settled: [],
  presentation: [],
  groupLabels: [],
  payload: [],
  titled: [],
  described: [],
  modal: [],
} satisfies Record<
  Exclude<keyof SelectState, "highlighted" | "listing">,
  readonly never[]
>

// Focus stays in the search field while there is one, unless a touch screen reader moved it into the list.
const searching = (state: SelectState) => state.searchable && !state.focusInList

const selectSlots = (slot: SlotFactory<SelectState, SelectApi>) => ({
  root: slot(rootPart<SelectState, SelectApi>({ focusOnSelfClick: true })),

  label: slot({
    attrs: (state, { id }) => ({ id: `${id}-label`, ...formAttrs(state) }),
    // Pressing the label focuses the trigger without opening the list, like a native select's label.
    press: ({ api }) => api.focus(),
    bind: (el, { store }) => flagWhileBound(store, "labeled"),
  }),

  trigger: slot<TriggerProps, SelectTriggerState>({
    role: "combobox",
    focus: "native",
    // With `virtualFocus`, the open list's keys too, since focus stays here.
    keys: (state) =>
      state.virtualFocus
        ? [...listStepKeys, "Home", "End", "Enter", " ", "Tab", "typeahead"]
        : ["ArrowDown", "ArrowUp", "Home", "End", "Enter", " ", "typeahead"],
    props: {
      disabled: "boolean",
      // Internal: passed by renderers. Select has no `field` slot, so no element attribute either.
      named: { kind: "boolean", from: "field" },
    },
    state: (state, { props }) => triggerState(state, props),
    attrs: (state, { id, props }) => {
      const { disabled, placeholder } = triggerState(state, props)
      return {
        id: `${id}-trigger`,
        type: "button",
        "aria-haspopup": "listbox",
        "aria-expanded": String(state.open),
        "aria-controls": state.mounted
          ? `${id}-${state.listed ? "list" : "content"}`
          : undefined,
        // Until a SelectLabel is known to be missing, it names the trigger, unless something else does.
        "aria-labelledby":
          state.labeled || (state.labeled === null && !props.named)
            ? `${id}-label`
            : undefined,
        "aria-readonly": state.readOnly ? "true" : undefined,
        "aria-required": state.required ? "true" : undefined,
        disabled: disabled ? "" : undefined,
        "data-placeholder": placeholder ? "" : undefined,
        ...openAttrs(state.open),
        ...formAttrs(state),
        "data-disabled": disabled ? "" : undefined,
      }
    },
    // Settling that there's no label drops the reference without rendering the trigger again.
    direct: direct(["aria-labelledby"]),
    live: live((state, { api }) => ({
      "aria-activedescendant":
        state.virtualFocus && !state.searchable
          ? api.internal.activeDescendant(state)
          : undefined,
    })),
    on: {
      keydown: (event, { api, el }) => api.internal.onTriggerKeyDown(event, el),
      pointerdown(event, { api, el, props, store }) {
        if (
          event.button !== 0 ||
          event.pointerType === "touch" ||
          props.disabled
        ) {
          return
        }
        if (isDisabled(store.get())) {
          return
        }
        // Mouse and pen open on press, like native selects. The click that follows is ignored.
        api.internal.pointerPress(el!, event)
      },
      pointerenter: (event, { api }) => api.internal.prepare(),
      focusin: (event, { api }) => api.internal.prepare(),
    },
    press({ api, props, store }, event) {
      if (props.disabled || api.internal.consumePressClick()) {
        return
      }
      if (store.get().open) {
        api.internal.hide({ reason: "trigger-press", event })
      } else {
        api.internal.show({ event, reason: "trigger-press" })
      }
    },
    bind(el, { api, id, store }) {
      settleFlag(store, "labeled")
      bindPageLocale(el, (pageLocale) => store.set({ pageLocale }))
      // A value whose label or icon only its item knows: render the list
      // hidden so the item registers, once the parts that render now have.
      if (!store.get().items && !api.internal.options().itemToLabel) {
        queueMicrotask(
          () =>
            api.internal.selection.needsItems(api.internal.hasValueIcon()) &&
            api.internal.prepare()
        )
      }
      if (dev) {
        warnIfUnnamed(
          el,
          "The trigger has no accessible name. Add a SelectLabel, a Field label or an aria-label.",
          { component: "select", id },
          () => !!store.get().labeled
        )
      }
    },
  }),

  value: slot<ValueProps, SelectValueState>({
    // `text` is internal: passed by renderers.
    props: {
      placeholder: "string",
      maxLabels: "number",
      getMoreLabel: "value",
      text: "boolean",
    },
    state: (state, { api, props }) => {
      const labels = api.internal.selection.labels()
      return {
        value: state.value,
        label: formatLabels(labels, props, localeOf(state)),
        labels,
        placeholder: labels.length === 0,
      }
    },
    attrs: (state, { id }) => ({
      id: `${id}-value`,
      "data-placeholder": hasValue(state) ? undefined : "",
    }),
    bind(el, { api, store, props }) {
      if (!props.text) {
        return
      }
      // Web components without their own content show the label, or the placeholder.
      const write = () => {
        const labels = api.internal.selection.labels()
        const text = labels.length
          ? formatLabels(labels, props, localeOf(store.get()))
          : (props.placeholder ?? store.get().placeholder ?? "")
        if (el.textContent !== text) {
          el.textContent = text
        }
      }
      write()
      return store.subscribe(write)
    },
  }),

  content: slot<SelectContentProps, SelectContentState>({
    props: {
      side: "string",
      align: "string",
      sideOffset: "number",
      alignOffset: "number",
      collisionPadding: "number",
      arrowPadding: "number",
      container: "value",
      anchor: "string",
      alignItemWithTrigger: "boolean",
      keepMounted: "boolean",
    },
    connect: registerPopupElement,
    state: contentState,
    present: (state, { props }) =>
      state.mounted || !!props.keepMounted || state.prepared,
    role: (state) => (state.listed ? undefined : "listbox"),
    roles: ["listbox"],
    // The search field keeps Home, End, Space and typed text for its own editing.
    keys: (state) =>
      searching(state)
        ? [...listStepKeys, "Enter", "Tab"]
        : [...listStepKeys, "Home", "End", "Enter", " ", "Tab", "typeahead"],
    attrs: (state, { id, api }) => ({
      ...popupContentAttrs(state, id),
      "aria-multiselectable":
        !state.listed && state.multiple ? "true" : undefined,
      ...(state.listed ? undefined : listName(state, id, api)),
      "aria-busy":
        !state.listed && state.status === "loading" ? "true" : undefined,
      "data-presentation": state.presentation,
    }),
    on: {
      keydown(event, { api, el }) {
        // Keys from a popup nested inside bubble through. Only the owner handles them.
        if (ownsEvent(el!, event)) {
          api.internal.onContentKeyDown(event)
        }
      },
    },
    bind(el, part) {
      const { internal } = part.api
      return bindListContent(el, part.key, part.store, internal, {
        part,
        anchor: internal.triggerElement,
        // The selected item over the trigger, when the content asks and it fits.
        aligned: () =>
          !!internal.contentProps(part.key).alignItemWithTrigger &&
          internal.alignedAnchor(el),
      })
    },
  }),

  // The full-screen element a list presented as a sheet sits in. The
  // adapters render it around the content, which they render only while present.
  viewport: slot({ present: (state) => state.presentation === "sheet" }),

  list: slot<{}, SelectContentState>({
    role: "listbox",
    keys: { none: "The content around it handles them." },
    state: contentState,
    attrs: (state, { id, api }) => ({
      id: `${id}-list`,
      "aria-multiselectable": state.multiple ? "true" : undefined,
      ...listName(state, id, api),
      "aria-busy": state.status === "loading" ? "true" : undefined,
    }),
    bind: (el, { store }) => flagWhileBound(store, "listed"),
  }),

  // A search field inside the list: a combobox that filters it while focus
  // stays in it, as the APG's select-only combobox with a search box asks. The
  // trigger stays the select's button, holding one value.
  input: slot<{}, SelectInputState>({
    role: "combobox",
    focus: "native",
    keys: {
      none: "The content around it handles them as they bubble from the field.",
    },
    state: (state) => ({ open: state.open, disabled: isDisabled(state) }),
    attrs: (state, { id }) => ({
      id: `${id}-input`,
      type: "text",
      value: state.query,
      autocomplete: "off",
      autocapitalize: "none",
      spellcheck: "false",
      "aria-autocomplete": "list",
      "aria-expanded": String(state.open),
      "aria-controls": `${id}-list`,
      disabled: isDisabled(state) ? "" : undefined,
    }),
    live: live((state, { api }) => ({
      "aria-activedescendant": api.internal.activeDescendant(state),
    })),
    on: { input: (event, { api }) => api.internal.typed(event) },
    bind(el, { api, id, store }) {
      // At once, since focus moves in a microtask after the list binds, and it must find the field.
      store.set({ searchable: true })
      // The DOM property, since an input's value attribute stops applying once someone types.
      const input = el as HTMLInputElement
      // Not until the field's input event is over: an owner's handler can flush a render before
      // Select reads the typed text, and the old query would replace it. A task, since microtasks
      // run between a real event's listeners.
      let typing = false
      const write = () => {
        if (!typing && input.value !== store.get().query) {
          input.value = store.get().query
        }
      }
      const onInput = () => {
        typing = true
        setTimeout(() => {
          typing = false
        })
      }
      input.addEventListener("input", onInput, { capture: true })
      write()
      if (dev) {
        warnIfUnnamed(
          el,
          "The search field has no accessible name. Add an aria-label.",
          {
            component: "select",
            id,
          }
        )
      }
      const unsubscribe = store.subscribe(write)
      return () => {
        unsubscribe()
        input.removeEventListener("input", onInput, { capture: true })
        queueMicrotask(
          () =>
            !api.internal.searchElement() && store.set({ searchable: false })
        )
      }
    },
  }),

  item: slot<ItemProps, SelectItemState>({
    role: "option",
    focus: (state) => (virtual(state) ? "active-descendant" : "roving"),
    props: {
      label: "string",
      disabled: "boolean",
      index: "number",
      value: "key",
      // Internal: passed by renderers, from the group it's inside.
      group: { kind: "string", from: "group.id" },
    },
    selects: selects({
      highlighted: ({ key }) => [key],
      listing: ({ key }) => [key],
      ...unreadByItems,
    }),
    state: (state, { key, props, api }) => itemState(state, key, props, api),
    attrs: (state, { id, key, props, api }) => {
      const { selected, disabled } = itemState(state, key, props, api)
      return {
        id: `${id}-option-${idPart(key)}`,
        tabindex: "-1",
        "aria-selected": String(selected),
        "aria-disabled": disabled ? "true" : undefined,
        ...positionAttrs(props.index, api.internal.listbox),
        hidden: api.internal.listbox.matches(key, props) ? undefined : "",
        "data-selected": selected ? "" : undefined,
        "data-disabled": disabled ? "" : undefined,
      }
    },
    // Typing hides options without rendering them.
    direct: direct(["hidden"]),
    live: live((state, { key }) => ({
      "data-highlighted": state.highlighted === key ? "" : undefined,
    })),
    on: {
      pointermove: (event, { api, key }) => api.internal.hover(key, event),
      // Presses keep focus in the search field or on the trigger.
      pointerdown: (event, context) =>
        virtual(context.store.get()) && holdFocus(event, context),
      mousedown: (event, context) =>
        virtual(context.store.get()) && holdFocus(event, context),
    },
    press: ({ api, key }, event) => api.internal.choose(key, event),
    bind(el, context) {
      return bindItem(el, context)
    },
  }),

  // The item's text, with what the search matched in `<mark>`.
  "item-text": slot<ListItemTextProps, SelectItemTextState>(
    itemTextPart<SelectState, SelectApi>()
  ),

  "item-indicator": slot<IndicatorProps, SelectItemIndicatorState>(
    itemIndicatorPart<SelectState, SelectApi>()
  ),

  group: slot(optionGroupPart<SelectState, SelectApi>()),

  "group-label": slot(groupLabelPart<SelectState, SelectApi>()),

  separator: slot(optionSeparatorPart<SelectState, SelectApi>()),

  empty: slot(emptyPart<SelectState, SelectApi>()),

  status: slot(statusPart<SelectState, SelectApi>()),

  clear: slot<SelectClearProps, SelectClearState>({
    props: { keepMounted: "boolean" },
    present: (state, { props }) =>
      !!props.keepMounted || (hasValue(state) && !isLocked(state)),
    state: (state) => ({ disabled: isLocked(state) }),
    attrs: (state) => ({
      type: "button",
      disabled: isDisabled(state) ? "" : undefined,
      "data-disabled": isLocked(state) ? "" : undefined,
    }),
    press({ api }) {
      api.internal.focusTrigger({ preventScroll: true })
      api.clear({ reason: "clear-press" })
    },
  }),

  arrow: slot<{}, SelectArrowState>(arrowPart<SelectState, SelectApi>()),

  "form-input": slot(hiddenInputPart<SelectState, SelectApi>("form-input")),

  "value-input": slot(valueInputPart<SelectState, SelectApi>()),
})

// Parts a select ships only once a page renders them. Each part registers its
// feature with `use` before it reads a slot.

/** An option that selects every item that matches, in its group or in the whole list, with `multiple`. */
const selectSelectAll = /* @__PURE__ */ selectAllFeature<
  SelectState,
  SelectApi
>({ focus: "roving" })

/**
 * An icon inside an item, and the selected item's icon for the trigger. In a
 * function, since bundlers keep a spread argument even of a pure call.
 */
const selectItemIcons = /* @__PURE__ */ (() =>
  itemIconsFeature<SelectState, SelectApi>({
    component: "select",
    ...optionIcon,
    register: rememberIcon,
  }))()

export { selectItemIcons, selectSelectAll, selectSlots }
