import type {
  Anchor,
  ChangeDetails,
  DismissAttemptDetails,
  Side,
} from "@ui-sdk/core"
import type { AsyncOptionsStatus } from "@ui-sdk/core/async-options"
import {
  autocomplete as autocompletePrimitive,
  type AutocompleteController,
  type AutocompleteDismissReason,
  type AutocompleteOpenChangeReason,
  type AutocompleteSubmitDetails,
  type AutocompleteValueChangeDetails,
  type ListAnnouncement,
  type ListData,
  type SearchFilter,
  type ListHighlightDetails,
} from "@ui-sdk/core/autocomplete"
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
  NotPlaced,
  slotContent,
  usePlaceContent,
  usePlacedContent,
} from "./children"
import { useFieldControl } from "./field-context"
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
import { createParts, withElement } from "./create-parts"
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
import { renderless } from "./renderless"
import { readOnlyOf } from "./text-control"

const ContainerKey: InjectionKey<() => PopupContainer> = Symbol(
  "autocomplete-container"
)

type ValueDetails = AutocompleteValueChangeDetails
type OpenDetails = ChangeDetails<AutocompleteOpenChangeReason>

const useAutocomplete = () => useHandle(autocompletePrimitive)

const parts = createParts(autocompletePrimitive, {
  label: "label",
  trigger: "button",
  clear: "button",
  item: "div",
  "item-icon": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
  status: "div",
  arrow: "div",
})

/**
 * A text field that suggests as you type. The text is the value. Renders no element of its own.
 * @stable
 */
const Autocomplete = /* @__PURE__ */ renderless(
  defineComponent({
    name: "Autocomplete",
    props: {
      value: { type: String, default: undefined },
      modelValue: { type: String, default: undefined },
      defaultValue: { type: String, default: undefined },
      open: optionalBoolean,
      defaultOpen: optionalBoolean,
      items: Array as PropType<ListData<string>>,
      emptyItems: Array as PropType<ListData<string>>,
      announcement: Function as PropType<
        (change: ListAnnouncement) => string | null | undefined
      >,
      filter: {
        type: [String, Boolean, Function] as PropType<SearchFilter<string>>,
        default: undefined,
      },
      inlineComplete: optionalBoolean,
      autoHighlight: optionalBoolean,
      openOnFocus: optionalBoolean,
      submitOnSelect: optionalBoolean,
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
      controller: Object as PropType<AutocompleteController>,
      dismissible: optionalBoolean,
      debug: optionalBoolean,
      container: containerProp,
    },
    emits: {
      "update:value": (_value: string) => true,
      "update:modelValue": (_value: string) => true,
      valueChange: (_value: string, _details: ValueDetails) => true,
      "update:open": (_open: boolean) => true,
      openChange: (_open: boolean, _details: OpenDetails) => true,
      openChangeComplete: (_open: boolean) => true,
      dismissAttempt: (
        _details: DismissAttemptDetails<AutocompleteDismissReason>
      ) => true,
      submit: (_value: string, _details: AutocompleteSubmitDetails) => true,
      highlight: (_value: string | null, _details: ListHighlightDetails) =>
        true,
      loadMore: () => true,
    },
    setup(props, { slots, attrs, emit }) {
      const field = useFieldControl()
      provide(ContainerKey, () => props.container)
      const autocomplete = usePrimitive(autocompletePrimitive, () => ({
        ...props,
        value: orModel(props.value, props.modelValue),
        container: undefined,
        name: props.name ?? field?.name(),
        disabled: props.disabled || field?.disabled(),
        readOnly: readOnlyOf(props, attrs),
        onValueChange: (value: string, details: ValueDetails) => {
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
          details: DismissAttemptDetails<AutocompleteDismissReason>
        ) => emit("dismissAttempt", details),
        onSubmit: (value: string, details: AutocompleteSubmitDetails) =>
          emit("submit", value, details),
        onHighlight: (value: string | null, details: ListHighlightDetails) =>
          emit("highlight", value, details),
        onLoadMore: () => emit("loadMore"),
      }))
      useControllerEntry(() => props.controller, autocomplete)
      provideSheetHeader()
      const placed = usePlacedContent()
      return () => {
        const children = slots.default?.() ?? []
        // A data autocomplete renders its list, unless the app placed an
        // AutocompleteContent: in the markup, or inside a component of its own.
        // Only a data one asks, so a composed one never renders again when its content mounts.
        const own =
          !props.items || placed() || hasChild(children, AutocompleteContent)
        return [
          children,
          props.items && !own && h(NotPlaced, () => h(AutocompleteContent)),
        ]
      }
    },
  })
)

/**
 * A visible label for the field.
 * @stable
 */
const AutocompleteLabel = parts.Label
/**
 * A line between items or groups, hidden from screen readers.
 * @stable
 */
const AutocompleteSeparator = parts.Separator

/**
 * The text field. It's the form control, so the text submits under the autocomplete's `name`.
 * @stable
 */
const AutocompleteInput = withElement(
  "input",
  defineComponent({
    name: "AutocompleteInput",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof autocompletePrimitive, "input">,
    setup(_, { attrs }) {
      const field = useFieldControl(attrs)
      const inHeader = useInSheetHeader()
      const part = usePart(
        autocompletePrimitive,
        "input",
        undefined,
        undefined,
        {
          tag: "input",
          extend: field?.props,
        }
      )
      return () => {
        const element = part()
        return element && inHeader(element)
      }
    },
  })
)

/**
 * A button that opens and closes the suggestions, out of the tab order.
 * @stable
 */
const AutocompleteTrigger = parts.Trigger

/**
 * A button that empties the field. Shown while there's text to clear. Name it with `aria-label`.
 * @stable
 */
const AutocompleteClear = parts.Clear

/**
 * The popup that holds the suggestions, positioned against the field.
 * @stable
 */
const AutocompleteContent = withElement(
  "div",
  defineComponent({
    name: "AutocompleteContent",
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
    slots: Object as PartSlots<typeof autocompletePrimitive, "content">,
    setup(props, { slots }) {
      usePlaceContent()
      const autocomplete = useAutocomplete()
      const inherited = inject(ContainerKey, () => undefined)
      const content = () => {
        const { container, ...content } = props
        return content
      }
      const header = useSheetHeader(autocomplete)
      const part = usePart(autocomplete, "content", content, undefined, {
        tag: "div",
        children: (state) => [
          header(),
          defaultSlot(
            slots,
            state,
            () => autocomplete.state.items && h(AutocompleteList)
          ),
        ],
      })
      return () => {
        const element = part()
        if (!element) {
          return null
        }
        return renderPopup(
          sheetViewport(autocomplete, element),
          props.container ?? inherited()
        )
      }
    },
  })
)

/**
 * The listbox. Without content, it renders the autocomplete's `items`, filtered.
 * @stable
 */
const AutocompleteList = withElement(
  "div",
  defineComponent({
    name: "AutocompleteList",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof autocompletePrimitive, "list">,
    setup(_, { slots }) {
      const autocomplete = useAutocomplete()
      return usePart(autocomplete, "list", undefined, undefined, {
        tag: "div",
        children: (state) =>
          defaultSlot(
            slots,
            state,
            () =>
              autocomplete.state.items &&
              h(AutocompleteItems, { items: state.items })
          ),
      })
    },
  })
)

/**
 * A suggestion. Choosing it fills the field in with its text.
 * @stable
 */
const AutocompleteItem = parts.Item

/**
 * The suggestion's text, with the part the field's text matched in `<mark>`. Without text content, it shows the suggestion's label.
 * @stable
 */
const AutocompleteItemText = withElement(
  "span",
  defineComponent({
    name: "AutocompleteItemText",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof autocompletePrimitive, "item-text">,
    setup(_, { slots }) {
      const item = useScope(autocompletePrimitive)?.around.item as
        (() => { value: string; label?: string }) | undefined
      if (!item) {
        throw new Error(
          "<AutocompleteItemText> must be used inside <AutocompleteItem>."
        )
      }
      // The text it marks, read from its content as it renders.
      let text = ""
      let own: VNode[] | undefined
      let ownText: string | undefined
      const part = usePart(
        autocompletePrimitive,
        "item-text",
        () => ({ id: item().value, text }),
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
        text = ownText ?? item().label ?? item().value
        return part()
      }
    },
  })
)

/**
 * An icon inside a suggestion. Screen readers, typeahead and filtering
 * skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
const AutocompleteItemIcon = parts.ItemIcon

/**
 * A group of items, named by its `AutocompleteGroupLabel`, and hidden while none of its items shows.
 * @stable
 */
const AutocompleteGroup = parts.Group

/**
 * The group's heading, which names the group.
 * @stable
 */
const AutocompleteGroupLabel = parts.GroupLabel

/**
 * Shown while no suggestion matches. Its message is announced when it appears.
 * @stable
 */
const AutocompleteEmpty = withElement(
  "div",
  defineComponent({
    name: "AutocompleteEmpty",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof autocompletePrimitive, "empty">,
    setup(_, { slots }) {
      return usePart(autocompletePrimitive, "empty", undefined, undefined, {
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
const AutocompleteStatus = parts.Status

/**
 * An arrow on the popup's edge that points at the field.
 * @stable
 */
const AutocompleteArrow = parts.Arrow

/**
 * Renders data suggestions. Used by data autocompletes, and available for custom layouts.
 * @stable
 */
const AutocompleteItems = defineComponent({
  name: "AutocompleteItems",
  props: {
    items: { type: Array as PropType<ListData<string>>, required: true },
  },
  setup(props) {
    return () =>
      h(ListItems, {
        items: props.items,
        parts: listParts,
        keyOf: String,
      })
  },
})

const listParts: ListParts = {
  Item: AutocompleteItem,
  Group: AutocompleteGroup,
  GroupLabel: AutocompleteGroupLabel,
  Separator: AutocompleteSeparator,
}

export { createAutocompleteController } from "@ui-sdk/core/autocomplete"
export type {
  AutocompleteApi,
  AutocompleteArrowState,
  AutocompleteChangeOptions,
  AutocompleteClearProps,
  AutocompleteClearState,
  AutocompleteContentProps,
  AutocompleteContentState,
  AutocompleteController,
  AutocompleteDismissReason,
  AutocompleteEmptyState,
  AutocompleteInputState,
  AutocompleteItemIconProps,
  AutocompleteItemIconState,
  AutocompleteItemProps,
  AutocompleteItemState,
  AutocompleteItemTextState,
  AutocompleteOpenChangeReason,
  AutocompleteOptions,
  AutocompletePrimitive,
  AutocompleteStatusState,
  AutocompleteSubmitDetails,
  AutocompleteTriggerState,
  AutocompleteValueChangeDetails,
  AutocompleteValueChangeReason,
  ListAnnouncement,
  ListData,
  ListFilter,
  ListGroup,
  ListHighlightDetails,
  ListItem,
  ListSeparator,
  MatchSegment,
  SearchFilter,
} from "@ui-sdk/core/autocomplete"

export {
  Autocomplete,
  AutocompleteArrow,
  AutocompleteClear,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteItemIcon,
  AutocompleteItems,
  AutocompleteItemText,
  AutocompleteLabel,
  AutocompleteList,
  AutocompleteSeparator,
  AutocompleteStatus,
  AutocompleteTrigger,
}
