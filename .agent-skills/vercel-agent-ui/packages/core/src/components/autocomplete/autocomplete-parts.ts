// Autocomplete's parts and the attributes they carry.
import { dev } from "#dev"
import type {
  AutocompleteArrowState,
  AutocompleteClearProps,
  AutocompleteClearState,
  AutocompleteContentProps,
  AutocompleteContentState,
  AutocompleteInputState,
  AutocompleteItemState,
  AutocompleteItemTextState,
  AutocompleteTriggerState,
} from "./autocomplete"
import { fieldPart, optionPart } from "../../foundation/lists/autocomplete-core"
import type {
  AutocompleteApi,
  AutocompleteItemMeta,
  AutocompleteState,
} from "./autocomplete-api"
import { openerOf } from "../../foundation/popups/popup"
import { bindSheetInput } from "../../foundation/popups/presentation"
import { watchFieldsets } from "../../foundation/forms/form"
import { type ListData } from "../../foundation/lists/listbox"
import {
  arrowPart,
  emptyPart,
  formAttrs,
  groupLabelPart,
  isDisabled,
  isLocked,
  optionGroupPart,
  optionSeparatorPart,
  statusPart,
  warnIfUnnamed,
} from "../../foundation/lists/listbox-parts"
import { flagWhileBound } from "../../foundation/kernel/bound-keys"
import {
  inputState,
  listContentPart,
  listId,
  listPart,
} from "../../foundation/lists/listbox-popup"
import { itemIconPart, optionIcon } from "../../foundation/lists/item-icon"
import {
  itemTextPart,
  type ListItemTextProps,
} from "../../foundation/lists/listbox-search"
import { openAttrs } from "../../foundation/kernel/attrs"
import type { SlotFactory } from "../../foundation/kernel/primitive-types"
import { selects } from "../../foundation/kernel/selects"
import { pressKeepsFocus } from "../../foundation/focus/press-keeps-focus"

const noSuggestions: ListData<string> = []

function contentState(
  state: AutocompleteState,
  { api }: { api: AutocompleteApi }
) {
  return {
    open: state.open,
    presentation: state.presentation,
    status: state.status,
    items:
      (api.internal.listbox.visibleData()?.list as
        ListData<string> | undefined) ?? noSuggestions,
  }
}

const field = fieldPart<AutocompleteState, AutocompleteApi>()

// A suggestion shows the highlight, whether real focus is in the list, and its
// own entry in the listing, which covers the query. Every other key is named
// here, so a key the state gains later is a type error until someone decides
// whether suggestions read it.
const unreadByItems = {
  open: [],
  mounted: [],
  value: [],
  query: [],
  initial: [],
  items: [],
  status: [],
  listed: [],
  labeled: [],
  inline: [],
  disabled: [],
  formDisabled: [],
  readOnly: [],
  required: [],
  name: [],
  form: [],
  mounts: [],
  settled: [],
  groupLabels: [],
  fieldName: [],
  presentation: [],
  trigger: [],
  payload: [],
  titled: [],
  described: [],
  modal: [],
} satisfies Record<
  Exclude<keyof AutocompleteState, "highlighted" | "focusInList" | "listing">,
  readonly never[]
>

const autocompleteSlots = (
  slot: SlotFactory<AutocompleteState, AutocompleteApi>
) => ({
  label: slot({
    attrs: (state, { id }) => ({
      id: `${id}-label`,
      for: `${id}-input`,
      ...formAttrs(state),
    }),
    // A label that isn't a native one for the field, like a custom element, focuses it all the same.
    press({ api, el }) {
      if (el instanceof HTMLLabelElement && el.control) {
        return
      }
      api.focus()
    },
    bind: (el, { store }) => flagWhileBound(store, "labeled"),
  }),

  // The text field. It's the form control, so the text submits under its `name`.
  input: slot<{}, AutocompleteInputState>({
    ...field,
    // ArrowRight and End accept an inline completion.
    keys: (state) => [
      ...field.keys,
      "Enter",
      "Escape",
      "Tab",
      ...(state.inline ? ["ArrowRight", "End"] : []),
    ],
    state: inputState,
    attrs: (state, context) => ({
      ...field.attrs(state, context),
      name: state.name,
      form: state.form,
      "aria-autocomplete": state.inline ? "both" : "list",
      "aria-controls": state.mounted ? listId(state, context.id) : undefined,
      "aria-labelledby": state.labeled ? `${context.id}-label` : undefined,
      required: state.required ? "" : undefined,
      readonly: state.readOnly ? "" : undefined,
      disabled: state.disabled ? "" : undefined,
      ...openAttrs(state.open),
      ...formAttrs(state),
    }),
    on: {
      ...field.on,
      focusin(event, { api, store }) {
        if (api.internal.options().openOnFocus && !store.get().open) {
          api.internal.show({ event, by: "keyboard", reason: "trigger-focus" })
        }
      },
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
            api.internal.contentElement()?.contains(next))
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
    // A press on the field reopens suggestions that open on focus, like after Escape closed them.
    press({ api, store }, event) {
      if (store.get().open || !api.internal.options().openOnFocus) {
        return
      }
      api.internal.show({ event, by: openerOf(event), reason: "trigger-press" })
    },
    bind(el, context) {
      const { api, id } = context
      const input = el as HTMLInputElement
      if (dev) {
        warnIfUnnamed(
          el,
          "The field has no accessible name. Add an AutocompleteLabel, a Field label or an aria-label.",
          { component: "autocomplete", id }
        )
      }
      const cleanups = [
        field.bind(el, context),
        api.internal.bindReset(input),
        watchFieldsets(input, api.internal.setFormDisabled),
        bindSheetInput(el, {
          store: context.store,
          presentation: api.internal.presentation,
          open: (event) =>
            api.internal.show({ event, by: "touch", reason: "trigger-press" }),
        }),
      ]
      return () => cleanups.forEach((cleanup) => cleanup())
    },
  }),

  // A button that opens and closes the suggestions. Out of the tab order, since the field already does it.
  trigger: slot<{}, AutocompleteTriggerState>({
    state: inputState,
    attrs: (state, { id }) => ({
      type: "button",
      tabindex: "-1",
      "aria-expanded": String(state.open),
      "aria-controls": state.mounted ? listId(state, id) : undefined,
      disabled: isDisabled(state) ? "" : undefined,
      ...openAttrs(state.open),
      ...formAttrs(state),
    }),
    on: pressKeepsFocus,
    press({ api, store }, event) {
      api.internal.inputElement()?.focus({ preventScroll: true })
      if (store.get().open) {
        api.internal.hide({ reason: "trigger-press", event })
      } else {
        api.internal.show({ event, by: "pointer", reason: "trigger-press" })
      }
    },
  }),

  // A button that empties the field. Shown while there's text to clear.
  clear: slot<AutocompleteClearProps, AutocompleteClearState>({
    props: { keepMounted: "boolean" },
    present: (state, { props }) =>
      !!props.keepMounted || (state.value !== "" && !isLocked(state)),
    state: (state) => ({ disabled: isLocked(state) }),
    attrs: (state) => ({
      type: "button",
      tabindex: "-1",
      disabled: isDisabled(state) ? "" : undefined,
      "data-disabled": isLocked(state) ? "" : undefined,
    }),
    on: pressKeepsFocus,
    press({ api }) {
      api.clear({ reason: "clear-press" })
      api.internal.inputElement()?.focus({ preventScroll: true })
    },
  }),

  content: slot<AutocompleteContentProps, AutocompleteContentState>({
    ...listContentPart<AutocompleteState, AutocompleteApi>(),
    state: contentState,
  }),

  // The full-screen element suggestions presented as a sheet sit in, and the
  // header at the top of the content that the field moves into while the
  // sheet is open. The adapters render both, inside the content's.
  viewport: slot({ present: (state) => state.presentation === "sheet" }),
  header: slot({
    present: (state) => state.presentation === "sheet" && state.open,
  }),

  list: slot<{}, AutocompleteContentState>({
    ...listPart<AutocompleteState, AutocompleteApi>(),
    state: contentState,
  }),

  item: slot<AutocompleteItemMeta, AutocompleteItemState>({
    ...optionPart<AutocompleteState, AutocompleteApi>(),
    selects: selects({
      highlighted: ({ key }) => [key],
      listing: ({ key }) => [key],
      ...unreadByItems,
    }),
    state: (state, { key, props }) => ({
      highlighted: state.highlighted === key,
      disabled: !!props.disabled,
    }),
  }),

  // The suggestion's text, with what the field's text matched in `<mark>`.
  "item-text": slot<ListItemTextProps, AutocompleteItemTextState>(
    itemTextPart<AutocompleteState, AutocompleteApi>()
  ),

  // An icon inside a suggestion.
  "item-icon": slot(
    itemIconPart<AutocompleteState, AutocompleteApi>({
      component: "autocomplete",
      ...optionIcon,
    })
  ),

  group: slot(optionGroupPart<AutocompleteState, AutocompleteApi>()),

  "group-label": slot(groupLabelPart<AutocompleteState, AutocompleteApi>()),

  separator: slot(optionSeparatorPart<AutocompleteState, AutocompleteApi>()),

  empty: slot(emptyPart<AutocompleteState, AutocompleteApi>()),

  status: slot(statusPart<AutocompleteState, AutocompleteApi>()),

  arrow: slot<{}, AutocompleteArrowState>(
    arrowPart<AutocompleteState, AutocompleteApi>()
  ),
})

export { autocompleteSlots }
