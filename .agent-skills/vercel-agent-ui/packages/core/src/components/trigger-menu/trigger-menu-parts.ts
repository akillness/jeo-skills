// TriggerMenu's parts and the attributes they carry.
import { popupContentAttrs } from "../../foundation/popups/popup"
import { registerPopupElement } from "../../foundation/popups/popup-elements"
import {
  contentAnchor,
  placementOptions,
} from "../../foundation/popups/popup-features"
import { pressKeepsFocus } from "../../foundation/focus/press-keeps-focus"
import { position } from "../../foundation/platform/position"
import { textFieldAdapter } from "../../foundation/text/caret"
import {
  groupLabelledBy,
  groupLabelPart,
  stashContent,
} from "../../foundation/lists/listbox-parts"
import { flagWhileBound } from "../../foundation/kernel/bound-keys"
import { itemIconPart, optionIcon } from "../../foundation/lists/item-icon"
import { idPart, openAttrs } from "../../foundation/kernel/attrs"
import { onProps } from "../../foundation/kernel/part"
import type { SlotFactory } from "../../foundation/kernel/primitive-types"
import type {
  TriggerMenuContentProps,
  TriggerMenuContentState,
  TriggerMenuData,
  TriggerMenuEmptyState,
  TriggerMenuHintState,
  TriggerMenuInputState,
  TriggerMenuItemProps,
  TriggerMenuItemState,
  TriggerMenuStatusState,
} from "./trigger-menu"
import type { TriggerMenuApi, TriggerMenuState } from "./trigger-menu-api"
import { selects } from "../../foundation/kernel/selects"
import { direct, live } from "../../foundation/kernel/live"

type ItemProps = TriggerMenuItemProps<unknown> & {
  /** @internal The group the item is in. */
  group?: string
}

type EmptyProps = {
  /** @internal Hides the message while items match, for web components that can't skip rendering it. */
  stash?: boolean
}

type TextProps = {
  /** @internal Writes the default text, for parts rendered without content of their own. */
  text?: boolean
}

const noItems: TriggerMenuData<unknown> = []

function contentState(
  state: TriggerMenuState,
  { api }: { api: TriggerMenuApi }
) {
  return {
    open: state.open,
    trigger: state.trigger,
    query: state.query,
    argument: state.argument,
    status: api.internal.options().status ?? state.loading,
    items:
      (api.internal.listbox.visibleData()?.list as TriggerMenuData<unknown>) ??
      noItems,
  }
}

// A suggestion shows the highlight and its own entry in the listing, which
// covers the query. Every other key is named here, so a key the state gains
// later is a type error until someone decides whether suggestions read it.
const unreadByItems = {
  open: [],
  mounted: [],
  navigated: [],
  trigger: [],
  query: [],
  argument: [],
  hint: [],
  items: [],
  loading: [],
  editor: [],
  field: [],
  listed: [],
  hasEmpty: [],
  settled: [],
  mounts: [],
  groupLabels: [],
  payload: [],
  pending: [],
  titled: [],
  described: [],
  modal: [],
  presentation: [],
} satisfies Record<
  Exclude<keyof TriggerMenuState, "highlighted" | "listing">,
  readonly never[]
>

const triggerMenuSlots = (
  slot: SlotFactory<TriggerMenuState, TriggerMenuApi>
) => ({
  // A <textarea> by default, or an <input> through custom rendering.
  input: slot<{}, TriggerMenuInputState>({
    role: (state) => (state.field === "input" ? "combobox" : undefined),
    roles: ["combobox"],
    focus: "native",
    // Home and End move the caret, which ends the match.
    keys: [
      "ArrowDown",
      "ArrowUp",
      "PageDown",
      "PageUp",
      "ctrl+n",
      "ctrl+p",
      "Enter",
      "Tab",
      "Escape",
      "Home",
      "End",
    ],
    state: (state) => ({ open: state.open, trigger: state.trigger }),
    attrs: (state) => ({
      "aria-autocomplete": "list",
      "aria-haspopup": "listbox",
      "data-trigger": state.trigger ?? undefined,
      ...openAttrs(state.open),
    }),
    // The expansion and active option, which depend on the element and the arrow keys.
    live: live((state, { api }) => {
      const {
        "aria-expanded": expanded,
        "aria-controls": controls,
        "aria-activedescendant": active,
      } = api.internal.fieldAttrs(state, state.field)
      return {
        "aria-expanded": expanded,
        "aria-controls": controls,
        "aria-activedescendant": active,
      }
    }),
    on: {
      keydown: (event, { api }) => api.internal.onKeyDown(event),
    },
    bind(el, { api }) {
      const field = el as HTMLInputElement | HTMLTextAreaElement
      api.internal.setOwnEditor(
        textFieldAdapter(field),
        field.localName === "input" ? "input" : "multiline"
      )
      return () => api.internal.setOwnEditor(undefined)
    },
  }),

  content: slot<TriggerMenuContentProps, TriggerMenuContentState>({
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
    // A list inside it is the listbox instead.
    role: (state) => (state.listed ? "presentation" : "listbox"),
    roles: ["presentation", "listbox"],
    keys: {
      none: "The editor handles them, and keeps focus while they move the highlight.",
    },
    state: contentState,
    present: (state, { props }) => state.mounted || !!props.keepMounted,
    attrs: (state, { id, api }) => ({
      ...popupContentAttrs(state, id),
      ...(state.listed ? {} : api.internal.listLabel()),
      "aria-busy":
        !state.listed && state.loading === "loading" ? "true" : undefined,
      "data-trigger": state.trigger ?? undefined,
    }),
    // Pressing the list keeps focus, the caret and the on-screen keyboard in the editor.
    on: pressKeepsFocus,
    bind(el, part) {
      const { api, key, store } = part
      const { internal } = api
      let active = true
      // Items bind in the same commit. A microtask later, an empty list is really empty.
      queueMicrotask(() => {
        if (!active) {
          return
        }
        store.set({ settled: true })
        internal.settle()
      })
      // The trigger's place in the text, read every frame. While the editor
      // loses focus for a moment, the list stays where it was.
      let last = { x: 0, y: 0, width: 0, height: 0 }
      const textAnchor = {
        getBoundingClientRect: () => (last = internal.anchorRect() ?? last),
      }
      const unbind = internal.popup.bind(el, {
        anchor: () =>
          contentAnchor(
            el,
            internal.contentProps(key).anchor,
            () => textAnchor
          ),
        position: () =>
          placementOptions(internal.contentProps(key), { align: "start" }),
        rendered: (listener) => onProps(part, listener),
        // Focus stays in the editor.
        initialFocus: () => undefined,
      })
      return () => {
        active = false
        unbind()
        store.set({ settled: false })
      }
    },
  }),

  list: slot<{}, TriggerMenuContentState>({
    role: "listbox",
    keys: {
      none: "The editor handles them, and keeps focus while they move the highlight.",
    },
    state: contentState,
    attrs: (state, { id, api }) => ({
      id: `${id}-list`,
      ...api.internal.listLabel(),
      "aria-busy": state.loading === "loading" ? "true" : undefined,
    }),
    bind: (_, { store }) => flagWhileBound(store, "listed"),
  }),

  item: slot<ItemProps, TriggerMenuItemState>({
    // `onSelect`'s Promise makes the token it inserts pending.
    props: {
      value: "key",
      label: "string",
      keywords: "list",
      disabled: "boolean",
      onSelect: "action",
      // Internal: passed by renderers, from the group it's inside.
      group: { kind: "string", from: "group.id" },
    },
    selects: selects({
      highlighted: ({ key }) => [key],
      listing: ({ key }) => [key],
      ...unreadByItems,
    }),
    role: "option",
    focus: "active-descendant",
    state: (state, { key, props }) => ({
      highlighted: state.highlighted === key,
      disabled: !!props.disabled,
    }),
    attrs: (state, { id, key, props, api }) => ({
      id: `${id}-option-${idPart(key)}`,
      "aria-disabled": props.disabled ? "true" : undefined,
      // Written by `live`, so moving the highlight doesn't render every option.
      "aria-selected": undefined,
      hidden: api.internal.listbox.matches(key, props) ? undefined : "",
      "data-disabled": props.disabled ? "" : undefined,
    }),
    // Typing hides options without rendering them.
    direct: direct(["hidden"]),
    live: live((state, { key }) => ({
      "aria-selected": state.highlighted === key ? "true" : "false",
      "data-highlighted": state.highlighted === key ? "" : undefined,
    })),
    on: {
      ...pressKeepsFocus,
      pointermove(event, { api, key, store }) {
        if (event.pointerType === "touch" || !store.get().open) {
          return
        }
        if (store.get().highlighted !== key) {
          api.internal.listbox.highlight(key, { event })
        }
      },
    },
    press: ({ api, key }, event) => api.internal.choose(key, event),
    bind(el, { api, key, props }) {
      const unregister = api.internal.listbox.register(key, el, () => {
        const latest = api.internal.itemProps(key) ?? props
        return {
          value: latest.value,
          label: latest.label,
          keywords: latest.keywords,
          disabled: latest.disabled,
          group: latest.group,
        }
      })
      return unregister
    },
  }),

  // An icon inside a suggestion.
  "item-icon": slot(
    itemIconPart<TriggerMenuState, TriggerMenuApi>({
      component: "trigger-menu",
      ...optionIcon,
    })
  ),

  group: slot({
    // Its id is made for it, and names the group its items and label are in.
    props: { id: "id" },
    role: "group",
    attrs: (state, { id, key, api }) => ({
      "aria-labelledby": groupLabelledBy(state, id, key),
      hidden: api.internal.listbox.groupMatches(key) ? undefined : "",
    }),
  }),

  "group-label": slot(groupLabelPart<TriggerMenuState, TriggerMenuApi>()),

  // A listbox may only hold options and groups, so separators are hidden from assistive technology.
  separator: slot({
    role: "none",
    attrs: (state) => ({
      "aria-hidden": "true",
      hidden: state.query && !state.items ? "" : undefined,
    }),
  }),

  // Shown while no item matches. Rendering it keeps the menu open with no matches.
  empty: slot<EmptyProps, TriggerMenuEmptyState>({
    // Internal: passed by renderers.
    props: { stash: "boolean" },
    role: "status",
    state: (state, { api }) => ({
      loading: (api.internal.options().status ?? state.loading) === "loading",
      empty: api.internal.isEmpty(state),
      query: state.query,
    }),
    attrs: (state, { api }) => ({
      "aria-live": "polite",
      "aria-atomic": "true",
      "data-empty": api.internal.isEmpty(state) ? "" : undefined,
      "data-loading": state.loading === "loading" ? "" : undefined,
    }),
    bind(el, { api, store, props }) {
      api.internal.countEmptyPart(1)
      const unstash = props.stash
        ? stashContent(
            el,
            () => api.internal.isEmpty(store.get()),
            store.subscribe
          )
        : undefined
      return () => {
        unstash?.()
        api.internal.countEmptyPart(-1)
      }
    },
  }),

  // A polite status outside the popup. Without content of its own, it says the
  // count and the keys, a moment after typing pauses.
  status: slot<TextProps, TriggerMenuStatusState>({
    // Internal: passed by renderers.
    props: { text: "boolean" },
    state: (state, { api }) => ({
      open: state.open,
      status: api.internal.options().status ?? state.loading,
      loading: (api.internal.options().status ?? state.loading) === "loading",
      count: api.internal.itemCount(),
      argument: state.argument,
    }),
    role: "status",
    attrs: () => ({ "aria-live": "polite", "aria-atomic": "true" }),
    bind: (_, { api }) => api.internal.announceState(),
  }),

  // Ghost text for the arguments still to type, drawn at the caret.
  hint: slot<TextProps, TriggerMenuHintState>({
    // Internal: passed by renderers.
    props: { text: "boolean" },
    present: (state) => !!state.hint,
    state: (state) => ({ argument: state.argument, hint: state.hint }),
    attrs: () => ({ "aria-hidden": "true" }),
    bind(el, { api, props, store }) {
      const computed = getComputedStyle(el)
      if (computed.position === "static") {
        el.style.position = "fixed"
      }
      el.style.pointerEvents = "none"
      const write = () => {
        if (props.text && el.textContent !== store.get().hint) {
          el.textContent = store.get().hint
        }
      }
      write()
      let last = { x: 0, y: 0, width: 0, height: 0 }
      const unsubscribe = store.subscribe(write)
      // After the caret, which is its left in right-to-left text.
      const side = computed.direction === "rtl" ? "left" : "right"
      const stop = position(
        () => ({
          getBoundingClientRect: () =>
            (last = api.internal.caretRect() ?? last),
        }),
        el,
        { side, align: "center", sideOffset: 2, collisionPadding: 0 }
      )
      return () => {
        unsubscribe()
        stop()
      }
    },
  }),
})

export { triggerMenuSlots, type TextProps }
