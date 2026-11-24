// Combobox's parts and the attributes they carry.
import { dev } from "#dev"
import type {
  ComboboxArrowState,
  ComboboxChipProps,
  ComboboxChipState,
  ComboboxChipsOverflowState,
  ComboboxClearProps,
  ComboboxClearState,
  ComboboxContentProps,
  ComboboxContentState,
  ComboboxCreateProps,
  ComboboxCreateState,
  ComboboxInputState,
  ComboboxItemIndicatorProps,
  ComboboxItemIndicatorState,
  ComboboxItemProps,
  ComboboxItemState,
  ComboboxItemTextState,
  ComboboxTriggerState,
  ComboboxValueProps,
  ComboboxValueState,
} from "./combobox"
import { bindChipsOverflow } from "./combobox-chips"
import { CREATE, type ComboboxApi, type ComboboxState } from "./combobox-api"
import { openerOf } from "../../foundation/popups/popup"
import { bindSheetInput } from "../../foundation/popups/presentation"
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
import { flagWhileBound } from "../../foundation/kernel/bound-keys"
import { takeTypedText } from "../../foundation/forms/form"
import { bindFieldName } from "../../foundation/lists/field-name"
import {
  inputState,
  listContentPart,
  listId,
  listPart,
} from "../../foundation/lists/listbox-popup"
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
import { formatLabels, listOf } from "../../foundation/lists/listbox-value"
import { bindPageLocale, localeOf } from "../../foundation/text/locale"
import { selects } from "../../foundation/kernel/selects"
import { direct, live } from "../../foundation/kernel/live"
import { pressKeepsFocus } from "../../foundation/focus/press-keeps-focus"
import { on } from "../../foundation/kernel/events"

type ItemProps = ComboboxItemProps<unknown> & {
  /** @internal The group the item is in. */
  group?: string
}

type CreateProps = ComboboxCreateProps & {
  /** @internal Writes `Create “…”` as text, for web components without their own content. */
  text?: boolean
}

type IndicatorProps = ComboboxItemIndicatorProps & {
  /** @internal The key of the item the indicator is in. */
  item?: string
}

type ChipProps = ComboboxChipProps<unknown>

type OverflowProps = {
  /** @internal Writes "+N more" as text, for web components without their own content. */
  text?: boolean
}

function itemState(
  state: ComboboxState,
  key: string,
  props: ItemProps,
  api: ComboboxApi
) {
  const selected = api.internal.selection.isSelected(key, props.value)
  const maxReached = !selected && api.internal.maxReached()
  return {
    highlighted: state.highlighted === key,
    selected,
    disabled: !!props.disabled || maxReached,
    maxReached,
  }
}

// An option shows the highlight, whether real focus is in the list, and its
// own entry in the listing, which covers the query and the value. Every other
// key is named here, so a key the state gains later is a type error until
// someone decides whether options read it.
const unreadByItems = {
  open: [],
  mounted: [],
  value: [],
  initial: [],
  trigger: [],
  query: [],
  dirty: [],
  status: [],
  listed: [],
  labeled: [],
  inlineInput: [],
  multiple: [],
  maxSelected: [],
  disabled: [],
  readOnly: [],
  required: [],
  name: [],
  form: [],
  formDisabled: [],
  items: [],
  pending: [],
  error: [],
  labels: [],
  icons: [],
  pageLocale: [],
  mounts: [],
  settled: [],
  presentation: [],
  prepared: [],
  groupLabels: [],
  fieldName: [],
  visibleChips: [],
  payload: [],
  titled: [],
  described: [],
  modal: [],
} satisfies Record<
  Exclude<keyof ComboboxState, "highlighted" | "focusInList" | "listing">,
  readonly never[]
>

function contentState(state: ComboboxState, { api }: { api: ComboboxApi }) {
  return {
    open: state.open,
    presentation: state.presentation,
    multiple: state.multiple,
    status: state.status,
    items: api.internal.listbox.visibleData()?.list ?? noItems,
  }
}

// Whether a chip collapsed into the overflow part: it's past the ones that fit.
function collapsed(state: ComboboxState, api: ComboboxApi, value: unknown) {
  if (state.visibleChips === null) {
    return false
  }
  return (
    api.internal.selection.keys().indexOf(api.internal.keyOf(value)) >=
    state.visibleChips
  )
}

// The chips that don't fit, the same object until that changes.
const overflowMemo = new WeakMap<object, ComboboxChipsOverflowState>()
// Inputs a native label just passed a click on to, for this task.
const labelClicked = new WeakSet<Element>()
function overflowState(state: ComboboxState, api: ComboboxApi) {
  const all = api.internal.selection.labels()
  const labels =
    state.visibleChips === null ? [] : all.slice(state.visibleChips)
  const last = overflowMemo.get(api)
  if (
    last?.labels.length === labels.length &&
    last.labels.every((label, index) => label === labels[index])
  ) {
    return last
  }
  const next = { count: labels.length, labels }
  overflowMemo.set(api, next)
  return next
}

const comboboxSlots = (slot: SlotFactory<ComboboxState, ComboboxApi>) => ({
  root: slot(rootPart<ComboboxState, ComboboxApi>({ focusOnSelfClick: false })),

  label: slot({
    attrs: (state, { id }) => ({
      id: `${id}-label`,
      for: `${id}-input`,
      ...formAttrs(state),
    }),
    // A label that isn't a native one for the input, like a custom element, focuses it all the same.
    press({ api, el }) {
      if (el instanceof HTMLLabelElement && el.control) {
        return
      }
      api.focus()
    },
    bind: (el, { store }) => flagWhileBound(store, "labeled"),
  }),

  input: slot<{}, ComboboxInputState>({
    role: "combobox",
    focus: "native",
    // Escape closes the list through its layer, not here.
    keys: (state) => [
      ...listStepKeys,
      "Enter",
      "Tab",
      ...(state.multiple ? ["Backspace", "ArrowLeft", "ArrowRight"] : []),
    ],
    state: inputState,
    attrs: (state, { id }) => ({
      id: `${id}-input`,
      type: "text",
      value: state.query,
      autocomplete: "off",
      autocapitalize: "none",
      spellcheck: "false",
      "aria-autocomplete": "list",
      "aria-expanded": String(state.open),
      "aria-controls": state.mounted ? listId(state, id) : undefined,
      "aria-labelledby": state.labeled ? `${id}-label` : undefined,
      "aria-required": state.required ? "true" : undefined,
      readonly: state.readOnly ? "" : undefined,
      disabled: isDisabled(state) ? "" : undefined,
      ...openAttrs(state.open),
      ...formAttrs(state),
    }),
    live: live((state, { api }) => ({
      "aria-activedescendant": api.internal.activeDescendant(state),
    })),
    on: {
      input: (event, { api }) => api.internal.onInput(event),
      keydown: (event, { api }) => api.internal.onInputKeyDown(event),
      focusout(event, { api, store }) {
        const next = event.relatedTarget as Node | null
        if (!store.get().open) {
          return
        }
        // A sheet stays open when the keyboard goes away, with what was typed.
        if (!next && store.get().presentation === "sheet") {
          return
        }
        if (
          next &&
          (api.internal.ownsElement(next) ||
            api.internal.popup.element()?.contains(next))
        ) {
          return
        }
        // Focus leaving the page, like to another window, is the layer's to decide.
        if (!next && !document.hasFocus()) {
          return
        }
        api.internal.hide({ reason: "focus-out", event })
      },
    },
    press({ api, el, store }, event) {
      if (store.get().open || (el && labelClicked.has(el))) {
        return
      }
      api.internal.show({ event, by: openerOf(event), reason: "trigger-press" })
    },
    bind(el, { api, id, store }) {
      bindPageLocale(el, (pageLocale) => store.set({ pageLocale }))
      bindFieldName(el, store, id)
      // A value whose label or icon only its item knows: render the list
      // hidden so the item says it, once the parts that render now have.
      const { items, itemToLabel } = api.internal.options()
      if (!items && !itemToLabel) {
        queueMicrotask(
          () =>
            api.internal.selection.needsItems(api.internal.hasValueIcon()) &&
            api.internal.prepare()
        )
      }
      // The DOM property, since an input's value attribute stops applying once someone types.
      const input = el as HTMLInputElement
      // Only a query that changed. Text on its way into the store, or to the owner of a
      // controlled `query`, is ahead of it, and writing the old text back moves the caret to the end.
      let shown: string | undefined
      const write = () => {
        const { query } = store.get()
        if (query === shown) {
          return
        }
        shown = query
        if (input.value !== query) {
          input.value = query
        }
      }
      takeTypedText(
        input,
        () => [store.get().query],
        () =>
          api.internal.typed(input.value, undefined, input.matches(":focus"))
      )
      write()
      if (dev) {
        warnIfUnnamed(
          el,
          "The input has no accessible name. Add a ComboboxLabel, a Field label or an aria-label.",
          { component: "combobox", id }
        )
      }
      const off = store.subscribe(write)
      // Inside the content, like in a popup a button opens, the input can't open the list itself.
      const offInline = el.closest('[data-slot="combobox-content"]')
        ? () => {}
        : flagWhileBound(store, "inlineInput")
      const offSheet = bindSheetInput(el, {
        store,
        presentation: api.internal.presentation,
        open: (event) =>
          api.internal.show({ event, by: "touch", reason: "trigger-press" }),
      })
      // A native label's click reaches the input as a click of its own, which only focuses, like a select.
      const offLabel = on(
        el.ownerDocument,
        "click",
        (event) => {
          const target = event.composedPath()[0] as Element
          if (target !== el && target.closest?.("label")?.control === el) {
            labelClicked.add(el)
            setTimeout(() => labelClicked.delete(el))
          }
        },
        { capture: true }
      )
      return () => {
        off()
        offInline()
        offSheet()
        offLabel()
      }
    },
  }),

  // A button that opens and closes the list. Out of the tab order beside an
  // input, since the input already does it, and in it when the input is in the popup.
  trigger: slot<{}, ComboboxTriggerState>({
    state: inputState,
    attrs: (state, { id }) => ({
      type: "button",
      tabindex: state.inlineInput ? "-1" : undefined,
      "aria-expanded": String(state.open),
      "aria-controls": state.mounted ? listId(state, id) : undefined,
      disabled: isDisabled(state) ? "" : undefined,
      ...openAttrs(state.open),
      ...formAttrs(state),
    }),
    on: {
      ...pressKeepsFocus,
      keydown: (event, { api }) => api.internal.onTriggerKeyDown(event),
    },
    // An input inside the popup binds only when it opens, so the trigger reads the page's language too.
    bind(el, { store }) {
      bindPageLocale(el, (pageLocale) => store.set({ pageLocale }))
    },
    press({ api, store }, event) {
      api.internal.inputElement()?.focus({ preventScroll: true })
      if (store.get().open) {
        return api.internal.hide({ reason: "trigger-press", event })
      }
      // Enter and Space press it too, as a click with no pointer behind it.
      const by = openerOf(event)
      api.internal.show({ event, by, reason: "trigger-press" })
    },
  }),

  content: slot<ComboboxContentProps, ComboboxContentState>({
    ...listContentPart<ComboboxState, ComboboxApi>(),
    state: contentState,
  }),

  // The full-screen element a list presented as a sheet sits in, and the
  // header at the top of the content that the input moves into while the
  // sheet is open. The adapters render both, inside the content's.
  viewport: slot({ present: (state) => state.presentation === "sheet" }),
  header: slot({
    present: (state) => state.presentation === "sheet" && state.open,
  }),

  list: slot<{}, ComboboxContentState>({
    ...listPart<ComboboxState, ComboboxApi>(),
    state: contentState,
  }),

  item: slot<ItemProps, ComboboxItemState>({
    role: "option",
    focus: "active-descendant",
    props: {
      label: "string",
      keywords: "list",
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
      const shown = api.internal.listbox.matches(key, props)
      return {
        id: `${id}-option-${idPart(key)}`,
        // Real focus reaches items only after a screen reader's tap moved it into the list.
        tabindex: state.focusInList ? "-1" : undefined,
        "aria-selected": String(selected),
        "aria-disabled": disabled ? "true" : undefined,
        ...positionAttrs(props.index, api.internal.listbox),
        hidden: shown ? undefined : "",
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
      ...pressKeepsFocus,
      pointermove: (event, { api, key }) => api.internal.hover(key, event),
    },
    press: ({ api, key }, event) => api.internal.choose(key, event),
    bind(el, context) {
      return bindItem(el, context)
    },
  }),

  // The item's text, with what the input's text matched in `<mark>`.
  "item-text": slot<ListItemTextProps, ComboboxItemTextState>(
    itemTextPart<ComboboxState, ComboboxApi>()
  ),

  "item-indicator": slot<IndicatorProps, ComboboxItemIndicatorState>(
    itemIndicatorPart<ComboboxState, ComboboxApi>()
  ),

  group: slot(optionGroupPart<ComboboxState, ComboboxApi>()),

  "group-label": slot(groupLabelPart<ComboboxState, ComboboxApi>()),

  separator: slot(optionSeparatorPart<ComboboxState, ComboboxApi>()),

  empty: slot(emptyPart<ComboboxState, ComboboxApi>()),

  status: slot(statusPart<ComboboxState, ComboboxApi>()),

  clear: slot<ComboboxClearProps, ComboboxClearState>({
    props: { keepMounted: "boolean" },
    present: (state, { props }) =>
      !!props.keepMounted ||
      ((listOf(state.value).length > 0 || state.query !== "") &&
        !isLocked(state)),
    state: (state) => ({ disabled: isLocked(state) }),
    attrs: (state) => ({
      type: "button",
      disabled: isDisabled(state) ? "" : undefined,
      "data-disabled": isLocked(state) ? "" : undefined,
    }),
    on: pressKeepsFocus,
    press({ api }) {
      api.clear({ reason: "clear-press" })
      api.internal.inputElement()?.focus({ preventScroll: true })
    },
  }),

  // The selected value, for rendering chips or a summary. Renders no element of its own.
  value: slot<ComboboxValueProps, ComboboxValueState>({
    props: { maxLabels: "number", getMoreLabel: "value" },
    state: (state, { api, props }) => {
      const labels = api.internal.selection.labels()
      return {
        value: state.value,
        labels,
        label: formatLabels(labels, props, localeOf(state)),
      }
    },
  }),

  arrow: slot<{}, ComboboxArrowState>(arrowPart<ComboboxState, ComboboxApi>()),

  "form-input": slot(hiddenInputPart<ComboboxState, ComboboxApi>("form-input")),

  "value-input": slot(valueInputPart<ComboboxState, ComboboxApi>()),
})

const comboboxSlot: SlotFactory<ComboboxState, ComboboxApi> = (definition) =>
  definition

/** An option that selects every item that matches, in its group or in the whole list, with `multiple`. */
const comboboxSelectAll = /* @__PURE__ */ selectAllFeature<
  ComboboxState,
  ComboboxApi
>({
  focus: "active-descendant",
})

/** An icon inside an item, and the selected item's icon next to the input. */
const comboboxItemIcons = /* @__PURE__ */ (() =>
  itemIconsFeature<ComboboxState, ComboboxApi>({
    component: "combobox",
    ...optionIcon,
    register: rememberIcon,
  }))()

/**
 * The `create` slot: an option that creates an item from the input's text. A
 * feature, so a combobox that never renders it ships none of its code.
 */
const comboboxCreate = /* @__PURE__ */ (() => ({
  slots: {
    // An option that creates an item from the input's text.
    create: comboboxSlot<CreateProps, ComboboxCreateState>({
      // `onCreate`'s Promise makes the option pending. `text` is internal: passed by renderers.
      props: { onCreate: "action", minLength: "number", text: "boolean" },
      present: (state, { api }) => api.internal.createShown(state),
      role: "option",
      focus: "active-descendant",
      state: (state) => ({
        query: state.query.trim(),
        highlighted: state.highlighted === CREATE,
        pending: state.pending,
        error: state.error,
      }),
      attrs: (state, { id }) => ({
        id: `${id}-create`,
        "aria-selected": "false",
        "aria-disabled": state.pending ? "true" : undefined,
        "aria-busy": state.pending ? "true" : undefined,
        "data-pending": state.pending ? "" : undefined,
      }),
      live: live((state) => ({
        "data-highlighted": state.highlighted === CREATE ? "" : undefined,
      })),
      on: {
        ...pressKeepsFocus,
        pointermove(event, { api, store }) {
          if (
            event.pointerType === "touch" ||
            store.get().highlighted === CREATE
          ) {
            return
          }
          api.internal.listbox.highlight(CREATE, { event })
        },
      },
      press: ({ api }, event) => api.internal.create(event),
      bind(el, { api, store, props }) {
        const unregister = api.internal.listbox.register(CREATE, el, () => ({
          value: CREATE,
          label: el.textContent ?? "",
          pinned: true,
        }))
        if (!props.text) {
          return unregister
        }
        // Web components without their own content offer the text.
        const write = () => {
          const text = `Create “${store.get().query.trim()}”`
          if (el.textContent !== text) {
            el.textContent = text
          }
        }
        write()
        const unsubscribe = store.subscribe(write)
        return () => {
          unsubscribe()
          unregister()
        }
      },
    }),
  },
}))()

/**
 * The `chips` slots: the selected values as chips around the input. A feature,
 * so a combobox that never renders them ships none of their code.
 */
const comboboxChips = /* @__PURE__ */ (() => ({
  slots: {
    // The selected values as chips, around the input. Pressing the empty space focuses the input.
    chips: comboboxSlot({
      role: "toolbar",
      keys: { none: "Each chip handles the arrows that move between chips." },
      // Named by the combobox's label, like the input the chips sit around.
      attrs: (state, { id }) => ({
        "aria-orientation": "horizontal",
        "aria-labelledby": state.labeled ? `${id}-label` : undefined,
        ...formAttrs(state),
      }),
      // A Field's label names the input by writing to it, so the chips take
      // that name too, unless the combobox's label or the author names them.
      bind(el, { api, store }) {
        let wrote: string | undefined
        const write = () => {
          const own = el.getAttribute("aria-labelledby") ?? undefined
          if (store.get().labeled || own !== wrote) {
            return
          }
          const name = el.hasAttribute("aria-label")
            ? undefined
            : (api.internal.inputElement()?.getAttribute("aria-labelledby") ??
              undefined)
          if (name === wrote) {
            return
          }
          wrote = name
          if (name) {
            el.setAttribute("aria-labelledby", name)
          } else {
            el.removeAttribute("aria-labelledby")
          }
        }
        write()
        const unsubscribe = store.subscribe(write)
        const observer =
          typeof MutationObserver === "undefined"
            ? undefined
            : new MutationObserver(write)
        observer?.observe(el, {
          attributeFilter: ["aria-labelledby", "aria-label"],
          childList: true,
          subtree: true,
        })
        return () => {
          unsubscribe()
          observer?.disconnect()
        }
      },
      on: {
        pointerdown(event, { api, el }) {
          if (event.target !== el) {
            return
          }
          event.preventDefault()
          api.internal.inputElement()?.focus()
        },
      },
    }),

    chip: comboboxSlot<ChipProps, ComboboxChipState>({
      // A group named by its value's label alone, around its remove button.
      // Delete or Backspace removes it.
      role: "group",
      props: { value: "string" },
      state: (state, { props, api }) => ({
        value: props.value,
        label: api.internal.selection.labelOf(props.value),
        disabled: isLocked(state),
      }),
      attrs: (state, { props, api }) => ({
        // Collapsed into the overflow part, past the chips that fit.
        hidden: collapsed(state, api, props.value) ? "" : undefined,
        "aria-label": api.internal.selection.labelOf(props.value) || undefined,
        tabindex: "-1",
        "aria-disabled": isDisabled(state) ? "true" : undefined,
        "data-disabled": isLocked(state) ? "" : undefined,
        "data-value": api.internal.keyOf(props.value),
      }),
      on: {
        keydown: (event, { api, el, props }) =>
          api.internal.onChipKeyDown(event, el!, props.value),
      },
    }),

    "chip-remove": comboboxSlot<Partial<ChipProps>, ComboboxClearState>({
      // Removes the chip it's inside.
      props: { value: { kind: "string", from: "chip" } },
      state: (state) => ({ disabled: isLocked(state) }),
      attrs: (state) => ({
        type: "button",
        tabindex: "-1",
        disabled: isDisabled(state) ? "" : undefined,
        "data-disabled": isLocked(state) ? "" : undefined,
      }),
      on: pressKeepsFocus,
      press({ api, props }, event) {
        api.internal.remove(props.value, event)
        api.internal.inputElement()?.focus({ preventScroll: true })
      },
    }),

    // How many chips don't fit, once some collapse: "+2 more". It's always in
    // the page, hidden while every chip fits, so its width is known.
    "chips-overflow": comboboxSlot<OverflowProps, ComboboxChipsOverflowState>({
      // Internal: passed by renderers.
      props: { text: "boolean" },
      state: (state, { api }) => overflowState(state, api),
      attrs: (state) => ({
        hidden: state.visibleChips === null ? "" : undefined,
      }),
      bind(el, { api, store, props }) {
        // The chips around it bind after it in some frameworks, so measuring starts a microtask later.
        let unbind = () => {}
        let active = true
        queueMicrotask(() => {
          const container = api.internal.chipsElement()
          if (!active || !container) {
            return
          }
          unbind = bindChipsOverflow(container, {
            chips: () => api.internal.chipElements(),
            overflow: el,
            input: api.internal.inputElement,
            report: api.internal.setVisibleChips,
            subscribe: store.subscribe,
          })
        })
        // Web components without their own content show the count.
        const write = () => {
          const text = `+${overflowState(store.get(), api).count} more`
          if (el.textContent !== text) {
            el.textContent = text
          }
        }
        if (props.text) {
          write()
        }
        const unsubscribe = props.text ? store.subscribe(write) : undefined
        return () => {
          active = false
          unsubscribe?.()
          unbind()
          api.internal.setVisibleChips(null)
        }
      },
    }),
  },
}))()

export {
  comboboxChips,
  comboboxCreate,
  comboboxItemIcons,
  comboboxSelectAll,
  comboboxSlots,
}
