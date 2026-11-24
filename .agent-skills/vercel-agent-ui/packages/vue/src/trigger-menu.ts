import type {
  Anchor,
  ChangeDetails,
  DismissAttemptDetails,
  Side,
} from "@ui-sdk/core"
import type { AsyncOptionsStatus } from "@ui-sdk/core/async-options"
import {
  triggerMenu as triggerMenuPrimitive,
  type TextEditorAdapter,
  type TokenInsert,
  type TriggerDefinition,
  type TriggerMenuController,
  type TriggerMenuData,
  type TriggerMenuDismissReason,
  type TriggerMenuOpenChangeReason,
  type TriggerMenuQueryChangeReason,
  type TriggerMenuSelectDetails,
} from "@ui-sdk/core/trigger-menu"
import {
  defineComponent,
  h,
  inject,
  provide,
  type InjectionKey,
  type PropType,
} from "vue"
import {
  hasChild,
  NotPlaced,
  usePlaceContent,
  usePlacedContent,
} from "./children"
import { EditorKey } from "./editor-context"
import {
  containerProp,
  renderPopup,
  useControllerEntry,
  type PopupContainer,
} from "./popup"
import { ListItems, type ListParts } from "./list-items"
import { createParts, withElement } from "./create-parts"
import {
  defaultSlot,
  optionalBoolean,
  orModel,
  useHandle,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"
import { renderless } from "./renderless"

const ContainerKey: InjectionKey<() => PopupContainer> = Symbol(
  "trigger-menu-container"
)

type OpenDetails = ChangeDetails<TriggerMenuOpenChangeReason> & {
  trigger: string | null
}
type QueryDetails = ChangeDetails<TriggerMenuQueryChangeReason> & {
  trigger: string
  argument?: string
}
type SelectHandler = (
  value: any,
  details: TriggerMenuSelectDetails<any>
) => void | Promise<void | Partial<TokenInsert>>

const useTriggerMenu = () => useHandle(triggerMenuPrimitive)

const parts = createParts(triggerMenuPrimitive, {
  input: "textarea",
  item: "div",
  "item-icon": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
})

/**
 * Suggestions opened by a trigger like `@` or `/` in text. Inside a TokenInput
 * it uses that editor; otherwise render a TriggerMenuInput, or pass `editor`.
 * @stable
 */
const TriggerMenu = /* @__PURE__ */ renderless(
  defineComponent({
    name: "TriggerMenu",
    props: {
      triggers: {
        type: Array as PropType<TriggerDefinition<any>[]>,
        required: true,
      },
      editor: Object as PropType<TextEditorAdapter>,
      open: optionalBoolean,
      modelValue: optionalBoolean,
      status: String as PropType<AsyncOptionsStatus>,
      autoHighlight: optionalBoolean,
      loop: optionalBoolean,
      shortcut: String,
      controller: Object as PropType<TriggerMenuController>,
      dismissible: optionalBoolean,
      debug: optionalBoolean,
      container: containerProp,
      // An action handler: a function prop beside the emit, so a returned Promise inserts a pending token.
      onSelect: Function as PropType<SelectHandler>,
      pendingAnnouncement: String,
    },
    emits: {
      "update:open": (_open: boolean) => true,
      "update:modelValue": (_open: boolean) => true,
      openChange: (_open: boolean, _details: OpenDetails) => true,
      openChangeComplete: (_open: boolean) => true,
      dismissAttempt: (
        _details: DismissAttemptDetails<TriggerMenuDismissReason>
      ) => true,
      queryChange: (_query: string, _details: QueryDetails) => true,
    },
    setup(props, { slots, emit }) {
      const inherited = inject(EditorKey, () => undefined)
      provide(ContainerKey, () => props.container)
      const menu = usePrimitive(triggerMenuPrimitive, () => ({
        ...props,
        open: orModel(props.open, props.modelValue),
        container: undefined,
        editor: props.editor ?? inherited(),
        onOpenChange: (open: boolean, details: OpenDetails) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("openChange", open, details)
          if (details.canceled) {
            return
          }
          emit("update:open", open)
          emit("update:modelValue", open)
        },
        onOpenChangeComplete: (open: boolean) =>
          emit("openChangeComplete", open),
        onDismissAttempt: (
          details: DismissAttemptDetails<TriggerMenuDismissReason>
        ) => emit("dismissAttempt", details),
        onQueryChange: (query: string, details: QueryDetails) =>
          emit("queryChange", query, details),
      }))
      useControllerEntry(() => props.controller, menu)
      const placed = usePlacedContent()
      return () => {
        const children = slots.default?.() ?? []
        // A data menu renders its list, unless the app placed a TriggerMenuContent:
        // in the markup, or inside a component of its own.
        const own = placed() || hasChild(children, TriggerMenuContent)
        return [children, !own && h(NotPlaced, () => h(TriggerMenuContent))]
      }
    },
  })
)

/**
 * The text field the menu suggests into: a `<textarea>`, or an `<input>` from the `render` slot.
 * @stable
 */
const TriggerMenuInput = parts.Input

/**
 * The popup that holds the suggestions, anchored at the caret.
 * @stable
 */
const TriggerMenuContent = withElement(
  "div",
  defineComponent({
    name: "TriggerMenuContent",
    inheritAttrs: false,
    props: {
      side: String as PropType<Side>,
      align: String as PropType<"start" | "center" | "end">,
      sideOffset: Number,
      alignOffset: Number,
      collisionPadding: Number,
      arrowPadding: Number,
      anchor: [Object, String] as PropType<Anchor | string | null>,
      keepMounted: optionalBoolean,
      container: containerProp,
    },
    slots: Object as PartSlots<typeof triggerMenuPrimitive, "content">,
    setup(props, { slots }) {
      usePlaceContent()
      const menu = useTriggerMenu()
      const inherited = inject(ContainerKey, () => undefined)
      const content = () => {
        const { container, ...content } = props
        return content
      }
      const part = usePart(menu, "content", content, undefined, {
        tag: "div",
        children: (state) =>
          defaultSlot(slots, state, () => h(TriggerMenuList)),
      })
      return () => {
        const element = part()
        if (!element) {
          return null
        }
        return renderPopup(element, props.container ?? inherited())
      }
    },
  })
)

/**
 * The listbox. Without children, it renders the current trigger's items, filtered.
 * @stable
 */
const TriggerMenuList = withElement(
  "div",
  defineComponent({
    name: "TriggerMenuList",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof triggerMenuPrimitive, "list">,
    setup(_, { slots }) {
      return usePart(triggerMenuPrimitive, "list", undefined, undefined, {
        tag: "div",
        children: (state) =>
          defaultSlot(slots, state, () =>
            h(TriggerMenuItems, { items: state.items as TriggerMenuData<any> })
          ),
      })
    },
  })
)

/**
 * A suggestion. Choosing it inserts it into the text.
 * @stable
 */
const TriggerMenuItem = parts.Item

/**
 * An icon inside a suggestion. Screen readers, typeahead and filtering
 * skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
const TriggerMenuItemIcon = parts.ItemIcon

/**
 * A group of items, named by its `TriggerMenuGroupLabel`.
 * @stable
 */
const TriggerMenuGroup = parts.Group

/**
 * The group's heading, which names the group.
 * @stable
 */
const TriggerMenuGroupLabel = parts.GroupLabel

/**
 * A line between items or groups, hidden from screen readers.
 * @stable
 */
const TriggerMenuSeparator = parts.Separator

/**
 * Shown while no item matches. Rendering it keeps the menu open with no matches.
 * @stable
 */
const TriggerMenuEmpty = withElement(
  "div",
  defineComponent({
    name: "TriggerMenuEmpty",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof triggerMenuPrimitive, "empty">,
    setup(_, { slots }) {
      return usePart(triggerMenuPrimitive, "empty", undefined, undefined, {
        tag: "div",
        children: (state) => (state.empty ? slots.default?.({ state }) : null),
      })
    },
  })
)

/**
 * A polite status, outside the popup. Without a default slot, it says the count and the keys once typing pauses.
 * @stable
 */
const TriggerMenuStatus = withElement(
  "div",
  defineComponent({
    name: "TriggerMenuStatus",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof triggerMenuPrimitive, "status">,
    setup(_, { slots }) {
      return usePart(triggerMenuPrimitive, "status", () => ({
        text: !slots.default,
      }))
    },
  })
)

/**
 * Ghost text at the caret for the arguments still to type. Without a default slot, the hints.
 * @stable
 */
const TriggerMenuHint = withElement(
  "span",
  defineComponent({
    name: "TriggerMenuHint",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof triggerMenuPrimitive, "hint">,
    setup(_, { slots }) {
      return usePart(
        triggerMenuPrimitive,
        "hint",
        () => ({ text: !slots.default }),
        undefined,
        "span"
      )
    },
  })
)

/**
 * Renders data items. Used by data menus, and available for custom layouts.
 * @stable
 */
const TriggerMenuItems = defineComponent({
  name: "TriggerMenuItems",
  props: {
    items: { type: Array as PropType<TriggerMenuData<any>>, required: true },
  },
  setup(props) {
    const menu = useTriggerMenu()
    return () =>
      h(ListItems, {
        items: props.items,
        parts: listParts,
        keyOf: menu.api.internal.keyOf,
      })
  },
})

const listParts: ListParts = {
  Item: TriggerMenuItem,
  Group: TriggerMenuGroup,
  GroupLabel: TriggerMenuGroupLabel,
  Separator: TriggerMenuSeparator,
}

export {
  createTriggerMenuController,
  textFieldAdapter,
} from "@ui-sdk/core/trigger-menu"
export type {
  EditorChange,
  EditorReplaceOptions,
  ListFilter,
  ListItem,
  ListSeparator,
  TextEditorAdapter,
  TextRange,
  TextRect,
  Token,
  TokenInsert,
  TriggerAfter,
  TriggerArgument,
  TriggerBoundary,
  TriggerDefinition,
  TriggerItemsLoader,
  TriggerMatch,
  TriggerMenuApi,
  TriggerMenuChangeOptions,
  TriggerMenuContentProps,
  TriggerMenuContentState,
  TriggerMenuController,
  TriggerMenuData,
  TriggerMenuDataGroup,
  TriggerMenuDataItem,
  TriggerMenuDismissReason,
  TriggerMenuEmptyState,
  TriggerMenuHintState,
  TriggerMenuInputState,
  TriggerMenuItemIconProps,
  TriggerMenuItemIconState,
  TriggerMenuItemProps,
  TriggerMenuItemState,
  TriggerMenuOpenChangeReason,
  TriggerMenuOptions,
  TriggerMenuPrimitive,
  TriggerMenuQueryChangeReason,
  TriggerMenuSelectDetails,
  TriggerMenuStatusState,
  TriggerRule,
} from "@ui-sdk/core/trigger-menu"

export {
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuEmpty,
  TriggerMenuGroup,
  TriggerMenuGroupLabel,
  TriggerMenuHint,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuItemIcon,
  TriggerMenuItems,
  TriggerMenuList,
  TriggerMenuSeparator,
  TriggerMenuStatus,
}
