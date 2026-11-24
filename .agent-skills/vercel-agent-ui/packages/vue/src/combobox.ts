import type {
  Anchor,
  ChangeDetails,
  DismissAttemptDetails,
  Side,
  StateOf,
} from "@ui-sdk/core"
import type { AsyncOptionsStatus } from "@ui-sdk/core/async-options"
import {
  combobox as comboboxPrimitive,
  type ComboboxOptions,
  type ComboboxController,
  type ComboboxDismissReason,
  type ComboboxOpenChangeReason,
  type ComboboxQueryChangeReason,
  type ComboboxValueChangeReason,
  type ListAnnouncement,
  type ListData,
  type ListFilter,
  type ListHighlightDetails,
} from "@ui-sdk/core/combobox"
import {
  comboboxChips,
  comboboxCreate,
  comboboxItemIcons,
  comboboxSelectAll,
  selectAllKey,
} from "@ui-sdk/core/renderer"
import {
  defineComponent,
  h,
  inject,
  provide,
  type InjectionKey,
  type PropType,
  type SlotsType,
  type VNode,
} from "vue"
import {
  hasChild,
  learnLabels,
  NotPlaced,
  notLabel,
  slotContent,
  usePlaceContent,
  usePlacedContent,
} from "./children"
import { useFieldControl } from "./field-context"
import { defineItemIcon, defineValueIcon } from "./item-icon"
import { markSegments, slotText } from "./list-text"
import {
  containerProp,
  provideSheetHeader,
  renderPopup,
  sheetViewport,
  useControllerEntry,
  useInSheetHeader,
  useSheetHeader,
  type PopupContainer,
} from "./popup"
import { ListItems, type ListParts } from "./list-items"
import {
  createParts,
  type RenderableWith,
  type RootInstanceOf,
  type RootPropsOf,
  withElement,
} from "./create-parts"
import {
  defaultSlot,
  optionalBoolean,
  orModel,
  provideProps,
  useHandle,
  usePart,
  usePrimitive,
  useScope,
  type PartSlots,
} from "./use-primitive"
import { FormInputs } from "./form-inputs"
import { renderless } from "./renderless"
import { readOnlyOf } from "./text-control"

const ContainerKey: InjectionKey<() => PopupContainer> =
  Symbol("combobox-container")

type ValueDetails = ChangeDetails<ComboboxValueChangeReason>
type QueryDetails = ChangeDetails<ComboboxQueryChangeReason>
type OpenDetails = ChangeDetails<ComboboxOpenChangeReason>

const useCombobox = () => useHandle(comboboxPrimitive)

const parts = createParts(comboboxPrimitive, {
  label: "label",
  trigger: "button",
  item: "div",
  "item-indicator": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
  status: "div",
  clear: "button",
  arrow: "div",
})

const anyValue = { type: null as unknown as PropType<unknown> }

// Generic over the value, like React's `Combobox<T>`: `v-model`, `@value-change`
// and the items share `T`. One shape per `multiple`, so the value is a list
// only with it, and a `multiple` known only at run time takes either.
type ComboboxProps<T, Multiple extends boolean | undefined> = ComboboxOptions<
  T,
  Multiple
> & {
  multiple?: Multiple
}
type ComboboxComponent = {
  new <T = string>(
    props: RootPropsOf<ComboboxProps<T, false>>
  ): RootInstanceOf<ComboboxProps<T, false>>
  new <T = string>(
    props: RootPropsOf<ComboboxProps<T, true>>
  ): RootInstanceOf<ComboboxProps<T, true>>
  new <T = string, Multiple extends boolean | undefined = boolean>(
    props: RootPropsOf<ComboboxProps<T, Multiple> & { multiple: Multiple }>
  ): RootInstanceOf<ComboboxProps<T, Multiple>>
} & RenderableWith<ComboboxProps<any, boolean | undefined>>

/**
 * A text input that filters a list as you type, to select one item, or several with `multiple`.
 * @stable
 */
const Combobox = /* @__PURE__ */ renderless(
  defineComponent({
    name: "Combobox",
    props: {
      value: anyValue,
      modelValue: anyValue,
      defaultValue: anyValue,
      query: { type: String, default: undefined },
      defaultQuery: { type: String, default: undefined },
      open: optionalBoolean,
      defaultOpen: optionalBoolean,
      multiple: optionalBoolean,
      maxSelected: Number,
      items: Array as PropType<ListData<any>>,
      emptyItems: Array as PropType<ListData<any>>,
      filter: {
        type: [String, Boolean, Function] as PropType<ListFilter<any>>,
        default: undefined,
      },
      announcement: Function as PropType<
        (change: ListAnnouncement) => string | null | undefined
      >,
      itemToValue: Function as PropType<(value: any) => string>,
      itemToLabel: Function as PropType<(value: any) => string>,
      isItemEqualToValue: Function as PropType<
        (itemValue: any, value: any) => boolean
      >,
      autoHighlight: {
        type: [Boolean, String] as PropType<boolean | "always" | "selected">,
        default: undefined,
      },
      keepQuery: optionalBoolean,
      pendingAnnouncement: String,
      allowCustomValue: optionalBoolean,
      status: String as PropType<AsyncOptionsStatus>,
      loop: optionalBoolean,
      modal: {
        type: [Boolean, String] as PropType<boolean | "pointer">,
        default: undefined,
      },
      presentation: String as PropType<"auto" | "popover" | "sheet">,
      disabled: optionalBoolean,
      readOnly: optionalBoolean,
      required: optionalBoolean,
      name: String,
      form: String,
      controller: Object as PropType<ComboboxController<any, any>>,
      dismissible: optionalBoolean,
      debug: optionalBoolean,
      container: containerProp,
    },
    emits: {
      "update:value": (_value: unknown) => true,
      "update:modelValue": (_value: unknown) => true,
      valueChange: (_value: unknown, _details: ValueDetails) => true,
      "update:query": (_query: string) => true,
      queryChange: (_query: string, _details: QueryDetails) => true,
      "update:open": (_open: boolean) => true,
      openChange: (_open: boolean, _details: OpenDetails) => true,
      openChangeComplete: (_open: boolean) => true,
      dismissAttempt: (
        _details: DismissAttemptDetails<ComboboxDismissReason>
      ) => true,
      highlight: (_value: unknown, _details: ListHighlightDetails) => true,
      loadMore: () => true,
    },
    setup(props, { slots, attrs, emit }) {
      const field = useFieldControl()
      provide(ContainerKey, () => props.container)
      const combobox = usePrimitive(comboboxPrimitive, () => ({
        ...props,
        value: orModel(props.value, props.modelValue),
        container: undefined,
        name: props.name ?? field?.name(),
        disabled: props.disabled || field?.disabled(),
        readOnly: readOnlyOf(props, attrs),
        onValueChange: (value: unknown, details: ValueDetails) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
        onQueryChange: (query: string, details: QueryDetails) => {
          emit("queryChange", query, details)
          if (!details.canceled) {
            emit("update:query", query)
          }
        },
        onOpenChange: (open: boolean, details: OpenDetails) => {
          emit("openChange", open, details)
          if (!details.canceled) {
            emit("update:open", open)
          }
        },
        onOpenChangeComplete: (open: boolean) =>
          emit("openChangeComplete", open),
        onDismissAttempt: (
          details: DismissAttemptDetails<ComboboxDismissReason>
        ) => emit("dismissAttempt", details),
        onHighlight: (value: unknown, details: ListHighlightDetails) =>
          emit("highlight", value, details),
        onLoadMore: () => emit("loadMore"),
      }))
      useControllerEntry(() => props.controller, combobox)
      provideSheetHeader()
      const placed = usePlacedContent()
      return () => {
        const children = slots.default?.() ?? []
        learnLabels(combobox.api.internal, children, itemDecorations)
        // A data combobox renders its list, unless the app placed a ComboboxContent:
        // in the markup, or inside a component of its own.
        // Only a data one asks, so a composed one never renders again when its content mounts.
        const own =
          !props.items || placed() || hasChild(children, ComboboxContent)
        return [
          children,
          props.items && !own && h(NotPlaced, () => h(ComboboxContent)),
          h(FormInputs, { handle: combobox }),
        ]
      }
    },
  })
) as unknown as ComboboxComponent

/**
 * A visible label for the input.
 * @stable
 */
const ComboboxLabel = parts.Label

/**
 * The selected values as chips, around the input.
 * @stable
 */
const ComboboxChips = /* @__PURE__ */ withElement(
  "div",
  /* @__PURE__ */ defineComponent({
    name: "ComboboxChips",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof comboboxPrimitive, "chips">,
    setup() {
      const combobox = useCombobox()
      combobox.instance.use(comboboxChips)
      return usePart(combobox, "chips")
    },
  })
)

/**
 * How many chips don't fit on the chips' line, once some collapse. Rendering it inside `ComboboxChips` turns collapsing on. Without content, "+2 more".
 * @stable
 */
const ComboboxChipsOverflow = /* @__PURE__ */ withElement(
  "span",
  /* @__PURE__ */ defineComponent({
    name: "ComboboxChipsOverflow",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof comboboxPrimitive, "chips-overflow">,
    setup(_, { slots }) {
      const combobox = useCombobox()
      combobox.instance.use(comboboxChips)
      return usePart(combobox, "chips-overflow", undefined, undefined, {
        tag: "span",
        children: (state) =>
          slotContent(slots.default, { state }) ?? `+${state.count} more`,
      })
    },
  })
)

/**
 * The text input that filters the list and holds the chosen item's label.
 * @stable
 */
const ComboboxInput = withElement(
  "input",
  defineComponent({
    name: "ComboboxInput",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof comboboxPrimitive, "input">,
    setup(_, { attrs }) {
      const field = useFieldControl(attrs)
      const inHeader = useInSheetHeader()
      const part = usePart(comboboxPrimitive, "input", undefined, undefined, {
        tag: "input",
        extend: field?.props,
      })
      return () => {
        const element = part()
        return element && inHeader(element)
      }
    },
  })
)

/**
 * A button that opens and closes the list, out of the tab order.
 * @stable
 */
const ComboboxTrigger = parts.Trigger

/**
 * The popup that holds the list, positioned against the input.
 * @stable
 */
const ComboboxContent = withElement(
  "div",
  defineComponent({
    name: "ComboboxContent",
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
    slots: Object as PartSlots<typeof comboboxPrimitive, "content">,
    setup(props, { slots }) {
      usePlaceContent()
      const combobox = useCombobox()
      const inherited = inject(ContainerKey, () => undefined)
      const content = () => {
        const { container, ...content } = props
        return content
      }
      const header = useSheetHeader(combobox)
      const part = usePart(combobox, "content", content, undefined, {
        tag: "div",
        children: (state) => [
          header(),
          defaultSlot(
            slots,
            state,
            () => combobox.state.items && h(ComboboxList)
          ),
        ],
      })
      return () => {
        const element = part()
        if (!element) {
          return null
        }
        return renderPopup(
          sheetViewport(combobox, element),
          props.container ?? inherited()
        )
      }
    },
  })
)

/**
 * The listbox. Without children, it renders the combobox's `items`, filtered.
 * @stable
 */
const ComboboxList = withElement(
  "div",
  defineComponent({
    name: "ComboboxList",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof comboboxPrimitive, "list">,
    setup(_, { slots }) {
      const combobox = useCombobox()
      return usePart(combobox, "list", undefined, undefined, {
        tag: "div",
        children: (state) =>
          defaultSlot(
            slots,
            state,
            () =>
              combobox.state.items && h(ComboboxItems, { items: state.items })
          ),
      })
    },
  })
)

/**
 * An option. Pressing it selects it, or toggles it with `multiple`.
 * @stable
 */
const ComboboxItem = parts.Item

/**
 * The check inside a selected item. Rendered while it's selected, or always with `keepMounted`.
 * @stable
 */
const ComboboxItemIndicator = parts.ItemIndicator

/**
 * The item's text, with the part the input's text matched in `<mark>`. Without text content, it shows the item's label.
 * @stable
 */
const ComboboxItemText = withElement(
  "span",
  defineComponent({
    name: "ComboboxItemText",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof comboboxPrimitive, "item-text">,
    setup(_, { slots }) {
      const item = useScope(comboboxPrimitive)?.around.item
      if (!item) {
        throw new Error(
          "<ComboboxItemText> must be used inside <ComboboxItem>."
        )
      }
      // The text it marks, read from its content as it renders.
      let text = ""
      let own: VNode[] | undefined
      let ownText: string | undefined
      const part = usePart(
        comboboxPrimitive,
        "item-text",
        () => ({ id: item().value as string, text }),
        undefined,
        {
          tag: "span",
          children: (state) =>
            own && ownText === undefined ? own : markSegments(state.segments),
        }
      )
      return () => {
        own = slotContent(slots.default, { state: part.state })
        ownText = slotText(own)
        text = ownText ?? ((item().label ?? item().value) as string)
        return part()
      }
    },
  })
)

/**
 * An option that selects every item that matches, with `multiple`: in its group inside a `ComboboxGroup`, or in the whole list.
 * @stable
 */
const ComboboxSelectAll = /* @__PURE__ */ withElement(
  "div",
  /* @__PURE__ */ defineComponent({
    name: "ComboboxSelectAll",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof comboboxPrimitive, "select-all">,
    setup() {
      const combobox = useCombobox()
      combobox.instance.use(comboboxSelectAll)
      const part = {
        id: selectAllKey(
          useScope(comboboxPrimitive)?.around.group?.().id as string | undefined
        ),
      }
      return usePart(combobox, "select-all", () => part)
    },
  })
)

/**
 * An icon inside an item. `ComboboxValueIcon` shows the selected item's next to the input.
 * Screen readers, typeahead and filtering
 * skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
const ComboboxItemIcon = /* @__PURE__ */ notLabel(
  /* @__PURE__ */ defineItemIcon(
    "ComboboxItemIcon",
    comboboxPrimitive,
    "item-icon",
    comboboxItemIcons
  )
)

// Parts inside an item that aren't its label, beside those marked with `notLabel`.
const itemDecorations = new Set<unknown>([ComboboxItemIndicator])

/**
 * The selected item's icon, copied from its `ComboboxItemIcon`, like next to the input.
 * Rendered while one item is selected and it has an icon.
 * @stable
 */
const ComboboxValueIcon = /* @__PURE__ */ defineValueIcon(
  "ComboboxValueIcon",
  comboboxPrimitive,
  comboboxItemIcons
)

/**
 * A group of items, named by its `ComboboxGroupLabel`, and hidden while none of its items shows.
 * @stable
 */
const ComboboxGroup = parts.Group

/**
 * The group's heading, which names the group.
 * @stable
 */
const ComboboxGroupLabel = parts.GroupLabel

/**
 * A line between items or groups, hidden from screen readers.
 * @stable
 */
const ComboboxSeparator = parts.Separator

/**
 * An option that creates an item from the input's text. Shown while the text matches no item's label exactly.
 * @stable
 */
// In a function, since the spread in its props keeps a bare call from dropping.
const ComboboxCreate = /* @__PURE__ */ (() =>
  withElement(
    "div",
    defineComponent({
      name: "ComboboxCreate",
      inheritAttrs: false,
      props: {
        // A function prop beside the emit, so a returned Promise marks the option pending.
        onCreate: Function as PropType<(query: string) => unknown>,
        minLength: Number,
      },
      slots: Object as PartSlots<typeof comboboxPrimitive, "create">,
      setup(props, { slots }) {
        const combobox = useCombobox()
        combobox.instance.use(comboboxCreate)
        const part = () => ({
          onCreate: props.onCreate,
          minLength: props.minLength,
        })
        return usePart(combobox, "create", part, undefined, {
          tag: "div",
          children: (state) =>
            slotContent(slots.default, { state }) ?? `Create “${state.query}”`,
        })
      },
    })
  ))()

/**
 * Shown while no item matches. Its message is announced when it appears.
 * @stable
 */
const ComboboxEmpty = withElement(
  "div",
  defineComponent({
    name: "ComboboxEmpty",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof comboboxPrimitive, "empty">,
    setup(_, { slots }) {
      return usePart(comboboxPrimitive, "empty", undefined, undefined, {
        tag: "div",
        children: (state) => (state.empty ? slots.default?.({ state }) : null),
      })
    },
  })
)

/**
 * A polite live region for loading and result counts. Its content is yours, from the default slot's state.
 * @stable
 */
const ComboboxStatus = parts.Status

/**
 * A button that empties the input and selects nothing. Shown while there's something to clear.
 * @stable
 */
const ComboboxClear = parts.Clear

type ValueState = StateOf<typeof comboboxPrimitive, "value">

/**
 * The selected value, for rendering chips or a summary. The default slot gets its state. Renders no element.
 * @stable
 */
const ComboboxValue = /* @__PURE__ */ renderless(
  defineComponent({
    name: "ComboboxValue",
    props: {
      maxLabels: Number,
      getMoreLabel: Function as PropType<(count: number) => string>,
    },
    slots: Object as SlotsType<{
      /** Renders the value from the part's state, and the value itself as `value`. */
      default?: (scope: {
        state: ValueState
        value: ValueState["value"]
      }) => VNode[]
    }>,
    setup(props, { slots }) {
      // Only its state: the part renders no element.
      const { state } = usePart(comboboxPrimitive, "value", () => ({
        maxLabels: props.maxLabels,
        getMoreLabel: props.getMoreLabel,
      }))
      // Nothing selected renders nothing, not an empty text: the server leaves
      // that out, and hydration would match the next node against it.
      return () =>
        slotContent(slots.default, { state, value: state.value }) ??
        (state.label || null)
    },
  })
)

/**
 * One selected value. Without children, it shows the value's label.
 * @stable
 */
// In a function, since the spread in its props keeps a bare call from dropping.
const ComboboxChip = /* @__PURE__ */ (() =>
  withElement(
    "div",
    defineComponent({
      name: "ComboboxChip",
      inheritAttrs: false,
      props: {
        value: { type: null as unknown as PropType<unknown>, required: true },
      },
      slots: Object as PartSlots<typeof comboboxPrimitive, "chip">,
      setup(props, { slots }) {
        const combobox = useCombobox()
        combobox.instance.use(comboboxChips)
        provideProps(comboboxPrimitive, "chip", () => ({ value: props.value }))
        const part = () => ({
          id: combobox.api.internal.keyOf(props.value),
          value: props.value,
        })
        return usePart(combobox, "chip", part, undefined, {
          tag: "div",
          children: (state) =>
            slotContent(slots.default, { state }) ?? state.label,
        })
      },
    })
  ))()

/**
 * A button inside a chip that removes its value. Name it with `aria-label`.
 * @stable
 */
const ComboboxChipRemove = /* @__PURE__ */ withElement(
  "button",
  /* @__PURE__ */ defineComponent({
    name: "ComboboxChipRemove",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof comboboxPrimitive, "chip-remove">,
    setup() {
      const combobox = useCombobox()
      combobox.instance.use(comboboxChips)
      const chip = useScope(comboboxPrimitive)?.around.chip
      if (!chip) {
        throw new Error(
          "<ComboboxChipRemove> must be used inside <ComboboxChip>."
        )
      }
      const value = () => chip().value
      const part = () => ({
        id: combobox.api.internal.keyOf(value()),
        value: value(),
      })
      return usePart(combobox, "chip-remove", part, undefined, "button")
    },
  })
)

/**
 * An arrow on the popup's edge that points at the input.
 * @stable
 */
const ComboboxArrow = parts.Arrow

/**
 * Renders data items. Used by data comboboxes, and available for custom layouts.
 * @stable
 */
const ComboboxItems = defineComponent({
  name: "ComboboxItems",
  props: {
    items: { type: Array as PropType<ListData<unknown>>, required: true },
  },
  setup(props) {
    const combobox = useCombobox()
    return () =>
      h(ListItems, {
        items: props.items,
        parts: listParts,
        keyOf: combobox.api.internal.keyOf,
      })
  },
})

const listParts: ListParts = {
  Item: ComboboxItem,
  Group: ComboboxGroup,
  GroupLabel: ComboboxGroupLabel,
  Separator: ComboboxSeparator,
}

export { createComboboxController } from "@ui-sdk/core/combobox"
// Core's `ComboboxValue` type ends in `Data` here, since the component has its name.
export type {
  ComboboxApi,
  ComboboxArrowState,
  ComboboxChangeOptions,
  ComboboxChipProps,
  ComboboxChipState,
  ComboboxChipsOverflowState,
  ComboboxClearProps,
  ComboboxClearState,
  ComboboxContentProps,
  ComboboxContentState,
  ComboboxController,
  ComboboxCreateProps,
  ComboboxCreateState,
  ComboboxDismissReason,
  ComboboxEmptyState,
  ComboboxInputState,
  ComboboxItemIconProps,
  ComboboxItemIconState,
  ComboboxItemIndicatorProps,
  ComboboxItemIndicatorState,
  ComboboxItemProps,
  ComboboxItemState,
  ComboboxItemTextState,
  ComboboxOpenChangeReason,
  ComboboxOptions,
  ComboboxPrimitive,
  ComboboxQueryChangeReason,
  ComboboxSelectAllState,
  ComboboxStatusState,
  ComboboxTriggerState,
  ComboboxValue as ComboboxValueData,
  ComboboxValueChangeReason,
  ComboboxValueProps,
  ComboboxValueState,
  ListAnnouncement,
  ListData,
  ListFilter,
  ListGroup,
  ListHighlightDetails,
  ListItem,
  ListSeparator,
  MatchSegment,
} from "@ui-sdk/core/combobox"

export {
  Combobox,
  ComboboxArrow,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxChipsOverflow,
  ComboboxClear,
  ComboboxContent,
  ComboboxCreate,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIcon,
  ComboboxItemIndicator,
  ComboboxItems,
  ComboboxItemText,
  ComboboxLabel,
  ComboboxList,
  ComboboxSelectAll,
  ComboboxSeparator,
  ComboboxStatus,
  ComboboxTrigger,
  ComboboxValue,
  ComboboxValueIcon,
}
