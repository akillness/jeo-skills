import type {
  Anchor,
  ChangeDetails,
  DismissAttemptDetails,
  Side,
} from "@ui-sdk/core"
import type { AsyncOptionsStatus } from "@ui-sdk/core/async-options"
import {
  selectAllKey,
  selectItemIcons,
  selectSelectAll,
} from "@ui-sdk/core/renderer"
import {
  select as selectPrimitive,
  type ListAnnouncement,
  type ListData,
  type ListFilter,
  type ListHighlightDetails,
  type SelectController,
  type SelectDismissReason,
  type SelectOptions,
  type SelectOpenChangeReason,
  type SelectQueryChangeReason,
  type SelectValueChangeReason,
  type SelectValueState,
} from "@ui-sdk/core/select"
import {
  defineComponent,
  h,
  inject,
  provide,
  type InjectionKey,
  type PropType,
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
import { ListItems, type ListParts } from "./list-items"
import { markSegments, slotText } from "./list-text"
import {
  containerProp,
  provideConnected,
  renderPopup,
  renderUnbound,
  useConnectedHandle,
  useConnectedPart,
  sheetViewport,
  useControllerTarget,
  useControllerEntry,
  type PopupContainer,
} from "./popup"
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
  Symbol("select-container")

type ValueDetails = ChangeDetails<SelectValueChangeReason>
type OpenDetails = ChangeDetails<SelectOpenChangeReason>
type QueryDetails = ChangeDetails<SelectQueryChangeReason>

const useSelect = () => useHandle(selectPrimitive)

const parts = createParts(selectPrimitive, {
  label: "div",
  input: "input",
  status: "div",
  item: "div",
  "item-indicator": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
  clear: "button",
  arrow: "div",
})

// Any value, including objects and null. Undefined means not passed.
const anyValue = { type: null as unknown as PropType<unknown> }

/**
 * Picks one value, or several with `multiple`, from a list in a popup.
 * @stable
 */
const Select = /* @__PURE__ */ renderless(
  defineComponent({
    name: "Select",
    props: {
      value: anyValue,
      modelValue: anyValue,
      defaultValue: anyValue,
      open: optionalBoolean,
      defaultOpen: optionalBoolean,
      multiple: optionalBoolean,
      items: Array as PropType<ListData<any>>,
      emptyItems: Array as PropType<ListData<any>>,
      query: { type: String, default: undefined },
      defaultQuery: String,
      filter: {
        type: [String, Boolean, Function] as PropType<ListFilter<any>>,
        default: undefined,
      },
      status: String as PropType<AsyncOptionsStatus>,
      announcement: Function as PropType<
        (change: ListAnnouncement) => string | null | undefined
      >,
      placeholder: String,
      itemToValue: Function as PropType<(value: any) => string>,
      itemToLabel: Function as PropType<(value: any) => string>,
      isItemEqualToValue: Function as PropType<
        (itemValue: any, value: any) => boolean
      >,
      loop: optionalBoolean,
      virtualFocus: optionalBoolean,
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
      autoComplete: String,
      controller: Object as PropType<SelectController<any, any>>,
      dismissible: optionalBoolean,
      debug: optionalBoolean,
      container: containerProp,
    },
    emits: {
      "update:value": (_value: unknown) => true,
      "update:modelValue": (_value: unknown) => true,
      valueChange: (_value: unknown, _details: ValueDetails) => true,
      "update:open": (_open: boolean) => true,
      openChange: (_open: boolean, _details: OpenDetails) => true,
      openChangeComplete: (_open: boolean) => true,
      dismissAttempt: (_details: DismissAttemptDetails<SelectDismissReason>) =>
        true,
      highlight: (_value: unknown, _details: ListHighlightDetails) => true,
      "update:query": (_query: string) => true,
      queryChange: (_query: string, _details: QueryDetails) => true,
      loadMore: () => true,
    },
    setup(props, { slots, attrs, emit }) {
      const field = useFieldControl()
      provide(ContainerKey, () => props.container)
      const select = usePrimitive(selectPrimitive, () => ({
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
        onOpenChange: (open: boolean, details: OpenDetails) => {
          emit("openChange", open, details)
          if (!details.canceled) {
            emit("update:open", open)
          }
        },
        onOpenChangeComplete: (open: boolean) =>
          emit("openChangeComplete", open),
        onDismissAttempt: (
          details: DismissAttemptDetails<SelectDismissReason>
        ) => emit("dismissAttempt", details),
        onHighlight: (value: unknown, details: ListHighlightDetails) =>
          emit("highlight", value, details),
        onQueryChange: (query: string, details: QueryDetails) => {
          emit("queryChange", query, details)
          if (!details.canceled) {
            emit("update:query", query)
          }
        },
        onLoadMore: () => emit("loadMore"),
      }))
      useControllerEntry(() => props.controller, select)
      const placed = usePlacedContent()
      return () => {
        const children = slots.default?.() ?? []
        learnLabels(select.api.internal, children, itemDecorations)
        // A data select renders its list, unless the app placed a SelectContent:
        // in the markup, or inside a component of its own.
        // Only a data one asks, so a composed one never renders again when its content mounts.
        const own =
          !props.items || placed() || hasChild(children, SelectContent)
        return [
          children,
          props.items && !own && h(NotPlaced, () => h(SelectContent)),
          h(FormInputs, { handle: select }),
        ]
      }
    },
  })
) as unknown as SelectComponent

// Generic over the value, like React's `Select<T>`: `v-model`, `@value-change`
// and the items share `T`. One shape per `multiple`, so the value is a list
// only with it, and a `multiple` known only at run time takes either.
type SelectProps<T, Multiple extends boolean | undefined> = SelectOptions<
  T,
  Multiple
> & {
  multiple?: Multiple
}
type SelectComponent = {
  new <T = string>(
    props: RootPropsOf<SelectProps<T, false>>
  ): RootInstanceOf<SelectProps<T, false>>
  new <T = string>(
    props: RootPropsOf<SelectProps<T, true>>
  ): RootInstanceOf<SelectProps<T, true>>
  new <T = string, Multiple extends boolean | undefined = boolean>(
    props: RootPropsOf<SelectProps<T, Multiple> & { multiple: Multiple }>
  ): RootInstanceOf<SelectProps<T, Multiple>>
} & RenderableWith<SelectProps<any, boolean | undefined>>

/**
 * A visible label for the select. Pressing it focuses the trigger, like a native select's label.
 * @stable
 */
const SelectLabel = parts.Label

/**
 * The button that opens the list: a combobox named by the label. Typing on it selects the item that matches.
 * @stable
 */
const SelectTrigger = withElement(
  "button",
  defineComponent({
    name: "SelectTrigger",
    inheritAttrs: false,
    props: {
      disabled: optionalBoolean,
      // Connects a trigger outside the select to the select with this controller.
      controller: Object as PropType<SelectController<any, any>>,
    },
    slots: Object as PartSlots<typeof selectPrimitive, "trigger">,
    setup(props, { slots, attrs }) {
      const connected = useControllerTarget(
        selectPrimitive,
        () => props.controller
      )
      provideConnected(selectPrimitive, connected)
      const field = useFieldControl(attrs)
      return useConnectedPart(
        connected,
        (select) =>
          usePart(
            select,
            "trigger",
            () => ({
              disabled: props.disabled,
              named: !!field || attrs["aria-labelledby"] != null,
            }),
            undefined,
            {
              tag: "button",
              // Its content, or without any, the value.
              children: (state) =>
                slotContent(slots.default, { state }) ?? h(SelectValue),
              extend: field?.props,
            }
          ),
        // Until its select mounts, a trigger outside it is a plain button.
        () => {
          const state = {
            open: false,
            disabled: !!props.disabled,
            readOnly: false,
            required: false,
            placeholder: true,
          }
          const own = { type: "button", ...attrs }
          // Without the field's ref, which would adopt it before it's a
          // combobox and never read its role again.
          const joined: Record<string, unknown> = field ? field.props(own) : own
          const { ref: _, ...merged } = joined
          return renderUnbound("button", merged, { slots, state })
        }
      )
    },
  })
)

// A value's state before its select is known.
const unselected: SelectValueState = {
  value: null,
  label: "",
  labels: [],
  placeholder: true,
}

/**
 * The selected item's label, or the placeholder. Renders it for you when it has no children.
 * @stable
 */
const SelectValue = withElement(
  "span",
  defineComponent({
    name: "SelectValue",
    inheritAttrs: false,
    props: {
      placeholder: String,
      maxLabels: Number,
      getMoreLabel: Function as PropType<(count: number) => string>,
    },
    slots: Object as PartSlots<typeof selectPrimitive, "value">,
    setup(props, { slots, attrs }) {
      const part = () => ({
        placeholder: props.placeholder,
        maxLabels: props.maxLabels,
        getMoreLabel: props.getMoreLabel,
      })
      const content = (state: SelectValueState, placeholder?: string) =>
        slotContent(slots.default, { state }) ??
        (state.placeholder
          ? (props.placeholder ?? placeholder ?? "")
          : state.label)
      return useConnectedPart(
        useConnectedHandle(selectPrimitive),
        (select) =>
          usePart(select, "value", part, undefined, {
            tag: "span",
            children: (state) => content(state, select.state.placeholder),
          }),
        // Inside a trigger outside its select, the placeholder until the select mounts.
        () =>
          renderUnbound("span", attrs, {
            slots,
            state: unselected,
            children: content,
          })
      )
    },
  })
)

/**
 * The popup that holds the items, positioned against the trigger.
 * @stable
 */
const SelectContent = withElement(
  "div",
  defineComponent({
    name: "SelectContent",
    inheritAttrs: false,
    props: {
      side: String as PropType<Side>,
      align: String as PropType<"start" | "center" | "end">,
      sideOffset: Number,
      alignOffset: Number,
      collisionPadding: Number,
      arrowPadding: Number,
      anchor: [Object, String] as PropType<Anchor | string | null>,
      alignItemWithTrigger: optionalBoolean,
      keepMounted: optionalBoolean,
      container: containerProp,
    },
    slots: Object as PartSlots<typeof selectPrimitive, "content">,
    setup(props, { slots }) {
      usePlaceContent()
      const select = useSelect()
      const inherited = inject(ContainerKey, () => undefined)
      const content = () => {
        const { container, ...content } = props
        return content
      }
      const part = usePart(select, "content", content, undefined, {
        tag: "div",
        children: (state) =>
          defaultSlot(
            slots,
            state,
            () => select.state.items && h(SelectItems, { items: state.items })
          ),
      })
      return () => {
        const element = part()
        if (!element) {
          return null
        }
        return renderPopup(
          sheetViewport(select, element),
          props.container ?? inherited()
        )
      }
    },
  })
)

/**
 * The listbox, when the content holds more than items, like a `SelectInput`. Without children, it renders the select's `items` that match.
 * @stable
 */
const SelectList = withElement(
  "div",
  defineComponent({
    name: "SelectList",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof selectPrimitive, "list">,
    setup(_, { slots }) {
      const select = useSelect()
      return usePart(select, "list", undefined, undefined, {
        tag: "div",
        children: (state) =>
          defaultSlot(
            slots,
            state,
            () => select.state.items && h(SelectItems, { items: state.items })
          ),
      })
    },
  })
)

/**
 * A search field inside `SelectContent` that filters the list while focus stays in it. Put the items in a `SelectList`. Name it with `aria-label`.
 * @stable
 */
const SelectInput = parts.Input

/**
 * Shown while no item matches the search. Its message is announced when it appears.
 * @stable
 */
const SelectEmpty = withElement(
  "div",
  defineComponent({
    name: "SelectEmpty",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof selectPrimitive, "empty">,
    setup(_, { slots }) {
      return usePart(selectPrimitive, "empty", undefined, undefined, {
        tag: "div",
        children: (state) => (state.empty ? slots.default?.({ state }) : null),
      })
    },
  })
)

/**
 * A polite live region for loading and result counts. Its content is yours, from its default slot's state.
 * @stable
 */
const SelectStatus = parts.Status

/**
 * An option. Pressing it selects it, or toggles it with `multiple`.
 * @stable
 */
const SelectItem = parts.Item

/**
 * The check inside a selected item. Rendered while it's selected, or always with `keepMounted`.
 * @stable
 */
const SelectItemIndicator = parts.ItemIndicator

/**
 * The item's text, with the part the search matched in `<mark>`. Without text content, it shows the item's label.
 * @stable
 */
const SelectItemText = withElement(
  "span",
  defineComponent({
    name: "SelectItemText",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof selectPrimitive, "item-text">,
    setup(_, { slots }) {
      const item = useScope(selectPrimitive)?.around.item
      if (!item) {
        throw new Error("<SelectItemText> must be used inside <SelectItem>.")
      }
      // The text it marks, read from its content as it renders.
      let text = ""
      let own: VNode[] | undefined
      let ownText: string | undefined
      const part = usePart(
        selectPrimitive,
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
 * An option that selects every item that matches, with `multiple`: in its group inside a `SelectGroup`, or in the whole list.
 * @stable
 */
const SelectSelectAll = /* @__PURE__ */ withElement(
  "div",
  /* @__PURE__ */ defineComponent({
    name: "SelectSelectAll",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof selectPrimitive, "select-all">,
    setup() {
      const select = useSelect()
      select.instance.use(selectSelectAll)
      const part = {
        id: selectAllKey(
          useScope(selectPrimitive)?.around.group?.().id as string | undefined
        ),
      }
      return usePart(select, "select-all", () => part)
    },
  })
)

/**
 * An icon inside an item. `SelectValueIcon` shows the selected item's in the trigger.
 * Screen readers, typeahead and filtering
 * skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
const SelectItemIcon = /* @__PURE__ */ notLabel(
  /* @__PURE__ */ defineItemIcon(
    "SelectItemIcon",
    selectPrimitive,
    "item-icon",
    selectItemIcons
  )
)

// Parts inside an item that aren't its label, beside those marked with `notLabel`.
const itemDecorations = new Set<unknown>([SelectItemIndicator])

/**
 * The selected item's icon, copied from its `SelectItemIcon`, like before the value in
 * the trigger. Rendered while one item is selected and it has an icon.
 * @stable
 */
const SelectValueIcon = /* @__PURE__ */ defineValueIcon(
  "SelectValueIcon",
  selectPrimitive,
  selectItemIcons
)

/**
 * A group of items, named by its `SelectGroupLabel`, and hidden while none of its items shows.
 * @stable
 */
const SelectGroup = parts.Group

/**
 * The group's heading, which names the group.
 * @stable
 */
const SelectGroupLabel = parts.GroupLabel

/**
 * A line between items or groups, hidden from screen readers.
 * @stable
 */
const SelectSeparator = parts.Separator

/**
 * A button that selects nothing. Shown while something is selected, or always with `keepMounted`.
 * @stable
 */
const SelectClear = parts.Clear

/**
 * An arrow on the popup's edge that points at the trigger.
 * @stable
 */
const SelectArrow = parts.Arrow

/**
 * Renders data items. Used by data selects, and available for custom layouts.
 * @stable
 */
const SelectItems = defineComponent({
  name: "SelectItems",
  props: {
    items: { type: Array as PropType<ListData<unknown>>, required: true },
  },
  setup(props) {
    const select = useSelect()
    return () =>
      h(ListItems, {
        items: props.items,
        parts: listParts,
        keyOf: select.api.internal.keyOf,
      })
  },
})

const listParts: ListParts = {
  Item: SelectItem,
  Group: SelectGroup,
  GroupLabel: SelectGroupLabel,
  Separator: SelectSeparator,
}

export { createSelectController } from "@ui-sdk/core/select"
// Core's `SelectValue` type ends in `Data` here, since the component has its name.
export type {
  ListAnnouncement,
  ListData,
  ListFilter,
  ListGroup,
  ListHighlightDetails,
  ListItem,
  ListSeparator,
  MatchSegment,
  SelectApi,
  SelectArrowState,
  SelectChangeOptions,
  SelectClearProps,
  SelectClearState,
  SelectContentProps,
  SelectContentState,
  SelectController,
  SelectDismissReason,
  SelectEmptyState,
  SelectInputState,
  SelectItemIconProps,
  SelectItemIconState,
  SelectItemIndicatorProps,
  SelectItemIndicatorState,
  SelectItemProps,
  SelectItemState,
  SelectItemTextState,
  SelectOpenChangeReason,
  SelectOptions,
  SelectPrimitive,
  SelectQueryChangeReason,
  SelectSelectAllState,
  SelectStatusState,
  SelectTriggerProps,
  SelectTriggerState,
  SelectValue as SelectValueData,
  SelectValueChangeReason,
  SelectValueProps,
  SelectValueState,
} from "@ui-sdk/core/select"

export {
  Select,
  SelectArrow,
  SelectClear,
  SelectContent,
  SelectEmpty,
  SelectGroup,
  SelectGroupLabel,
  SelectInput,
  SelectItem,
  SelectItemIcon,
  SelectItemIndicator,
  SelectItems,
  SelectItemText,
  SelectLabel,
  SelectList,
  SelectSelectAll,
  SelectSeparator,
  SelectStatus,
  SelectTrigger,
  SelectValue,
  SelectValueIcon,
}
