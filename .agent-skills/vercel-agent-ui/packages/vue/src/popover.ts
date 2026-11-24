import type {
  Anchor,
  ChangeDetails,
  DismissAttemptDetails,
  Side,
} from "@ui-sdk/core"
import {
  popover as popoverPrimitive,
  type PopoverController,
  type PopoverDismissReason,
  type PopoverFinalFocus,
  type PopoverInitialFocus,
  type PopoverOpenChangeReason,
  type PopoverPayloadChangeReason,
} from "@ui-sdk/core/popover"
import {
  defineComponent,
  h,
  inject,
  onMounted,
  provide,
  ref,
  useId,
  type InjectionKey,
  type PropType,
} from "vue"
import { slotContent } from "./children"
import {
  containerProp,
  type PopupContainer,
  renderPopup,
  renderUnbound,
  sheetViewport,
  useConnectedPart,
  useControllerEntry,
  useControllerTarget,
  usePopupContainer,
  withPayload,
} from "./popup"
import { createParts, withElement } from "./create-parts"
import {
  optionalBoolean,
  orModel,
  type PrimitiveHandle,
  useHandle,
  usePart,
  usePrimitive,
  useScope,
  type PartSlots,
} from "./use-primitive"
import { renderless } from "./renderless"

type OpenDetails = ChangeDetails<PopoverOpenChangeReason>
type PayloadDetails = ChangeDetails<PopoverPayloadChangeReason>

type PopoverContext = PrimitiveHandle<typeof popoverPrimitive>

// Where the popup renders. Set on <Popover> or <PopoverContent>.
const ContainerKey: InjectionKey<() => PopupContainer> =
  Symbol("popover-container")
// The trigger a PopoverShortcut sits in: its shortcut, and the popover it opens. A trigger
// connected through a controller sits outside the popover, so its popover comes from here.
const TriggerKey: InjectionKey<{
  shortcut: () => string | undefined
  popover: () => PopoverContext | undefined
}> = Symbol("popover-trigger")

const parts = createParts(popoverPrimitive, {
  title: "h2",
  description: "p",
  close: "button",
  arrow: "div",
})

/**
 * Rich content in a floating panel, opened from a button. Put its trigger and content inside.
 * @stable
 */
const Popover = /* @__PURE__ */ renderless(
  defineComponent({
    name: "Popover",
    props: {
      open: optionalBoolean,
      modelValue: optionalBoolean,
      defaultOpen: optionalBoolean,
      modal: {
        type: [Boolean, String] as PropType<boolean | "trap-focus">,
        default: undefined,
      },
      openOnHover: optionalBoolean,
      delay: Number,
      closeDelay: Number,
      presentation: String as PropType<"auto" | "popover" | "sheet">,
      controller: Object as PropType<PopoverController<any>>,
      dismissible: optionalBoolean,
      debug: optionalBoolean,
      container: containerProp,
    },
    emits: {
      "update:open": (_open: boolean) => true,
      "update:modelValue": (_open: boolean) => true,
      openChange: (_open: boolean, _details: OpenDetails) => true,
      openChangeComplete: (_open: boolean) => true,
      dismissAttempt: (_details: DismissAttemptDetails<PopoverDismissReason>) =>
        true,
      payloadChange: (_payload: unknown, _details: PayloadDetails) => true,
    },
    setup(props, { slots, emit }) {
      provide(ContainerKey, () => props.container)
      const popover = usePrimitive(popoverPrimitive, () => ({
        ...props,
        open: orModel(props.open, props.modelValue),
        container: undefined,
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
          details: DismissAttemptDetails<PopoverDismissReason>
        ) => emit("dismissAttempt", details),
        onPayloadChange: (payload: unknown, details: PayloadDetails) =>
          emit("payloadChange", payload, details),
      }))
      useControllerEntry(() => props.controller, popover)
      return () => slots.default?.()
    },
  })
)

/**
 * The button that opens the popover. A trigger outside the popover connects through `controller`.
 * @stable
 */
const PopoverTrigger = withElement(
  "button",
  defineComponent({
    name: "PopoverTrigger",
    inheritAttrs: false,
    props: {
      disabled: optionalBoolean,
      focusableWhenDisabled: optionalBoolean,
      payload: null as unknown as PropType<unknown>,
      // A keyboard shortcut that presses the trigger, like "mod+i".
      shortcut: String,
      // Connects a trigger outside the popover to the popover with this controller.
      controller: Object as PropType<PopoverController<any>>,
    },
    slots: Object as PartSlots<typeof popoverPrimitive, "trigger">,
    setup(props, { slots, attrs }) {
      const connected = useControllerTarget(
        popoverPrimitive,
        () => props.controller
      )
      provide(TriggerKey, {
        shortcut: () => props.shortcut,
        popover: connected,
      })
      const id = useId()
      const part = () => ({
        id,
        disabled: props.disabled,
        focusableWhenDisabled: props.focusableWhenDisabled,
        payload: props.payload,
        shortcut: props.shortcut,
      })
      return useConnectedPart(
        connected,
        (popover) => usePart(popover, "trigger", part, undefined, "button"),
        // Until the popover it names mounts, a trigger outside the popover is a plain button.
        () =>
          renderUnbound(
            "button",
            {
              type: "button",
              disabled: props.disabled && !props.focusableWhenDisabled,
              "aria-disabled":
                (props.disabled && props.focusableWhenDisabled) || undefined,
              ...attrs,
            },
            { slots, state: { open: false, disabled: !!props.disabled } }
          )
      )
    },
  })
)

/**
 * The panel itself, positioned against its trigger, named by its title and described by its description.
 * @stable
 */
const PopoverContent = withPayload(
  withElement(
    "div",
    defineComponent({
      name: "PopoverContent",
      inheritAttrs: false,
      props: {
        side: String as PropType<Side>,
        align: String as PropType<"start" | "center" | "end">,
        sideOffset: Number,
        alignOffset: Number,
        collisionPadding: Number,
        arrowPadding: Number,
        anchor: [Object, String] as PropType<Anchor | string | null>,
        initialFocus: [
          String,
          Object,
          Function,
        ] as PropType<PopoverInitialFocus>,
        finalFocus: [String, Object, Function] as PropType<PopoverFinalFocus>,
        keepMounted: optionalBoolean,
        inline: optionalBoolean,
        // Renders the popup into this element instead of in place.
        container: containerProp,
      },
      slots: Object as PartSlots<typeof popoverPrimitive, "content">,
      setup(props) {
        const popover = useHandle(popoverPrimitive)
        const fromRoot = inject(ContainerKey, () => undefined)
        const target = usePopupContainer(() => props.container ?? fromRoot())
        const content = () => {
          const { container, ...content } = props
          return content
        }
        const part = usePart(popover, "content", content)
        return () => {
          const element = part()
          if (!element) {
            return null
          }
          const shown = sheetViewport(popover, element)
          return props.inline ? shown : renderPopup(shown, target())
        }
      },
    })
  )
)

/**
 * The popover's title, which names it. A level 2 heading by default.
 * @stable
 */
const PopoverTitle = parts.Title
/**
 * Describes the popover while it's rendered. A paragraph by default.
 * @stable
 */
const PopoverDescription = parts.Description
/**
 * A button that closes the popover.
 * @stable
 */
const PopoverClose = parts.Close

/**
 * An arrow on the panel's edge that points at its trigger.
 * @stable
 */
const PopoverArrow = parts.Arrow

// The bound part of a shortcut, once its popover is known. It binds once, so it's
// keyed by the popover's instance and binds again when a trigger switches popovers.
const ShortcutBinding = defineComponent({
  name: "PopoverShortcutBinding",
  inheritAttrs: false,
  props: {
    popover: { type: Object as PropType<PopoverContext>, required: true },
    shortcut: String,
  },
  setup(props, { slots }) {
    return usePart(
      props.popover,
      "shortcut",
      () => ({ shortcut: props.shortcut }),
      undefined,
      {
        tag: "span",
        children: (state) =>
          slotContent(slots.default, { state }) ?? state.text,
      }
    )
  },
})

/**
 * Shows a trigger's shortcut, like ⌘I, inside the trigger. Hidden from screen readers, which hear
 * aria-keyshortcuts.
 * @stable
 */
const PopoverShortcut = withElement(
  "span",
  defineComponent({
    name: "PopoverShortcut",
    inheritAttrs: false,
    props: {
      // The keys to show. Inside a trigger, its shortcut.
      shortcut: String,
    },
    slots: Object as PartSlots<typeof popoverPrimitive, "shortcut">,
    setup(props, { slots, attrs }) {
      const context = useScope(popoverPrimitive)?.handle
      const trigger = inject(TriggerKey, null)
      if (!context && !trigger) {
        throw new Error("Popover parts must be used inside <Popover>.")
      }
      // A trigger outside the popover finds it through its controller only on the client.
      // Until mounted, its shortcut renders nothing, as on the server, so hydration matches.
      const mounted = ref(!!context)
      onMounted(() => (mounted.value = true))
      return () => {
        const popover =
          context ?? (mounted.value ? trigger?.popover() : undefined)
        // Inside a trigger whose popover hasn't mounted yet, there's no shortcut to show.
        if (!popover) {
          return null
        }
        const shortcut = props.shortcut ?? trigger?.shortcut()
        return h(
          ShortcutBinding,
          { ...attrs, key: popover.instance.id, popover, shortcut },
          slots
        )
      }
    },
  })
)

export { createPopoverController } from "@ui-sdk/core/popover"
export type {
  PopoverApi,
  PopoverArrowState,
  PopoverContentProps,
  PopoverContentState,
  PopoverController,
  PopoverDismissReason,
  PopoverFinalFocus,
  PopoverInitialFocus,
  PopoverOpenChangeReason,
  PopoverOptions,
  PopoverPayloadChangeReason,
  PopoverPrimitive,
  PopoverShortcutProps,
  PopoverShortcutState,
  PopoverTriggerProps,
  PopoverTriggerState,
} from "@ui-sdk/core/popover"

export {
  Popover,
  PopoverArrow,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverShortcut,
  PopoverTitle,
  PopoverTrigger,
}
