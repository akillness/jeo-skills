// What Combobox and Autocomplete share as fields that pop up a list: the
// content the list opens in, the list part inside it, and the state their
// field and its buttons reflect.
import { afterBind } from "../kernel/after-bind"
import { type AsyncOptionsStatus } from "./async-options"
import { type FieldName, listName } from "./field-name"
import { isDisabled, listStepKeys } from "./listbox-parts"
import { flagWhileBound } from "../kernel/bound-keys"
import { pressKeepsFocus } from "../focus/press-keeps-focus"
import {
  type Anchor,
  type PortalProps,
  type PositionProps,
} from "../platform/position"
import { popupContentAttrs } from "../popups/popup"
import { registerPopupElement } from "../popups/popup-elements"
import { contentAnchor, placementOptions } from "../popups/popup-features"
import { type SheetConfig, sheetSnapPoints } from "../popups/presentation"
import { onProps } from "../kernel/part"
import type {
  BaseSlotProps,
  Part,
  RoleFields,
  SlotDefinition,
} from "../kernel/primitive-types"
import type { Store } from "../kernel/store"

type ListPopupState = {
  open: boolean
  mounted: boolean
  presentation: "popover" | "sheet"
  status: AsyncOptionsStatus
  // Whether the list part is in the page, which then is the listbox instead of the content.
  listed: boolean
  labeled: boolean
  fieldName: FieldName
  settled: boolean
  // A combobox's: options can be chosen together.
  multiple?: boolean
  // A combobox's: the list renders hidden while its items tell a value's label.
  prepared?: boolean
}

type ListContentProps = PositionProps & PortalProps & { keepMounted?: boolean }

// What a list's content binds with, from its component.
type ListContentInternal = {
  presentation: { bind: (el: HTMLElement, config: SheetConfig) => () => void }
  loadMore: { bind: (el: HTMLElement) => () => void }
  contentProps: (key: string) => ListContentProps
  arrowElement: () => HTMLElement | undefined
  initialFocus: () => HTMLElement | undefined
}

// What the content needs from its component.
type ListPopupApi = {
  internal: ListContentInternal & {
    // What the list is placed against without an `anchor` prop.
    anchorElement: () => Anchor | undefined
    onListKeyDown: (event: KeyboardEvent) => void
  }
}

type FieldState = {
  open: boolean
  disabled: boolean
  formDisabled: boolean
  readOnly: boolean
  required: boolean
}

// What the field and the button that opens the list show.
const inputState = (state: FieldState) => ({
  open: state.open,
  disabled: isDisabled(state),
  readOnly: state.readOnly,
  required: state.required,
})

// The id of the element the field controls: the list part's, or the content's.
const listId = (state: { listed: boolean }, id: string) =>
  `${id}-${state.listed ? "list" : "content"}`

const unnamed = { "aria-labelledby": undefined, "aria-label": undefined }

// The popup the list opens in. It's the listbox itself until a list part
// renders inside it, next to a header or a status.
function listContentPart<
  State extends ListPopupState,
  Api extends ListPopupApi,
>() {
  return {
    props: {
      side: "string",
      align: "string",
      sideOffset: "number",
      alignOffset: "number",
      collisionPadding: "number",
      arrowPadding: "number",
      container: "value",
      anchor: "string",
      keepMounted: "boolean",
    },
    connect: registerPopupElement,
    present: (state, { props }) =>
      state.mounted || !!props.keepMounted || !!state.prepared,
    role: (state) => (state.listed ? "presentation" : "listbox"),
    roles: ["presentation", "listbox"],
    // Only while a screen reader moved real focus into the list. Otherwise the field's input takes them.
    keys: [...listStepKeys, "Home", "End", "Enter", " ", "typeahead"],
    attrs: (state, { id }) => ({
      ...popupContentAttrs(state, id),
      "aria-multiselectable":
        !state.listed && state.multiple ? "true" : undefined,
      ...(state.listed ? unnamed : listName(state, id)),
      "aria-busy":
        !state.listed && state.status === "loading" ? "true" : undefined,
      "data-presentation": state.presentation,
    }),
    on: {
      ...pressKeepsFocus,
      keydown: (event, { api }) => api.internal.onListKeyDown(event),
    },
    bind: (el, part) =>
      bindListContent(el, part.key, part.store, part.api.internal, {
        part,
        anchor: part.api.internal.anchorElement,
        // A sheet opens at half the screen at most, and grows for the keyboard.
        snapPoints: sheetSnapPoints,
      }),
  } satisfies SlotDefinition<State, Api, ListContentProps & BaseSlotProps, {}> &
    RoleFields<State, Api, ListContentProps & BaseSlotProps>
}

// Shows a list's content below its anchor, settled once its items had the
// chance to bind. `aligned` is the element to line the content up over
// instead, like a select's selected item over its trigger.
function bindListContent(
  el: HTMLElement,
  key: string,
  // Typed down to the one key it writes, which every component's state has.
  flags: Store<{ settled: boolean }>,
  internal: ListContentInternal,
  config: {
    part: Part
    anchor: () => Anchor | undefined
    aligned?: () => Anchor | false | null | undefined
    snapPoints?: SheetConfig["snapPoints"]
  }
) {
  const { aligned } = config
  // Items bind in the same commit as the content. A microtask later, an empty list is really empty.
  let active = true
  afterBind(() => active && flags.set({ settled: true }))
  const unloading = internal.loadMore.bind(el)
  const unbind = internal.presentation.bind(el, {
    snapPoints: config.snapPoints,
    anchor: () =>
      contentAnchor(
        el,
        internal.contentProps(key).anchor,
        () => aligned?.() || config.anchor()
      ),
    position: () => {
      const props = internal.contentProps(key)
      // Lined up over its anchor, it covers it.
      const over = aligned?.()
        ? ({ ...props, side: "bottom", align: "start", sideOffset: 0 } as const)
        : props
      return placementOptions(over, { align: "start" }, internal.arrowElement())
    },
    rendered: (listener) => onProps(config.part, listener),
    // Focus stays in the field, unless a screen reader's tap moved it into
    // the list. An arrow key that opened the list highlights now.
    initialFocus: internal.initialFocus,
  })
  return () => {
    active = false
    unloading()
    unbind()
    flags.set({ settled: false })
  }
}

// The listbox inside the content, when the content holds more than the list.
function listPart<State extends ListPopupState, Api>() {
  return {
    role: "listbox",
    keys: {
      none: "The field's input handles them, or the content around the list once focus is in it.",
    },
    attrs: (state, { id }) => ({
      id: `${id}-list`,
      "aria-multiselectable": state.multiple ? "true" : undefined,
      ...listName(state, id),
      "aria-busy": state.status === "loading" ? "true" : undefined,
    }),
    bind: (el, { store }) => flagWhileBound(store, "listed"),
  } satisfies SlotDefinition<State, Api, BaseSlotProps, {}> &
    RoleFields<State, Api, BaseSlotProps>
}

export { bindListContent, inputState, listContentPart, listId, listPart }
