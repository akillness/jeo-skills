import type { Anchor, ChangeDetails, Side } from "@ui-sdk/core"
import {
  tooltip as tooltipPrimitive,
  type TooltipController,
  type TooltipOpenChangeReason,
  type TooltipPayloadChangeReason,
} from "@ui-sdk/core/tooltip"
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
  useConnectedPart,
  useControllerEntry,
  useControllerTarget,
  usePopupContainer,
  withPayload,
} from "./popup"
import { createParts, withElement } from "./create-parts"
import {
  copyProps,
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

type OpenDetails = ChangeDetails<TooltipOpenChangeReason>
type PayloadDetails = ChangeDetails<TooltipPayloadChangeReason>

type TooltipContext = PrimitiveHandle<typeof tooltipPrimitive>

// Where the popup renders. Set on <Tooltip> or <TooltipContent>.
const ContainerKey: InjectionKey<() => PopupContainer> =
  Symbol("tooltip-container")
// The tooltip of the trigger a TooltipShortcut sits in. A trigger connected through a
// controller sits outside the tooltip, so its tooltip comes from here.
const TriggerKey: InjectionKey<() => TooltipContext | undefined> =
  Symbol("tooltip-trigger")

const parts = createParts(tooltipPrimitive, { arrow: "div" })

/**
 * A short label or hint that appears when the pointer rests on its trigger or keyboard focus reaches it.
 * @stable
 */
const Tooltip = /* @__PURE__ */ renderless(
  defineComponent({
    name: "Tooltip",
    props: {
      open: optionalBoolean,
      modelValue: optionalBoolean,
      defaultOpen: optionalBoolean,
      delay: Number,
      closeDelay: Number,
      disabled: optionalBoolean,
      toggleable: optionalBoolean,
      closeOnPress: optionalBoolean,
      type: String as PropType<"label" | "description">,
      shortcut: String,
      controller: Object as PropType<TooltipController<any>>,
      debug: optionalBoolean,
      container: containerProp,
    },
    emits: {
      "update:open": (_open: boolean) => true,
      "update:modelValue": (_open: boolean) => true,
      openChange: (_open: boolean, _details: OpenDetails) => true,
      openChangeComplete: (_open: boolean) => true,
      payloadChange: (_payload: unknown, _details: PayloadDetails) => true,
    },
    setup(props, { slots, emit }) {
      provide(ContainerKey, () => props.container)
      const tooltip = usePrimitive(tooltipPrimitive, () => ({
        ...copyProps(props),
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
        onPayloadChange: (payload: unknown, details: PayloadDetails) =>
          emit("payloadChange", payload, details),
      }))
      useControllerEntry(() => props.controller, tooltip)
      return () => slots.default?.()
    },
  })
)

/**
 * The element the tooltip names or describes, usually a button.
 * @stable
 */
const TooltipTrigger = withElement(
  "button",
  defineComponent({
    name: "TooltipTrigger",
    inheritAttrs: false,
    props: {
      payload: null as unknown as PropType<unknown>,
      // Connects a trigger outside the tooltip to the tooltip with this controller.
      controller: Object as PropType<TooltipController<any>>,
    },
    slots: Object as PartSlots<typeof tooltipPrimitive, "trigger">,
    setup(props, { slots, attrs }) {
      const connected = useControllerTarget(
        tooltipPrimitive,
        () => props.controller
      )
      provide(TriggerKey, connected)
      const id = useId()
      return useConnectedPart(
        connected,
        (tooltip) =>
          usePart(
            tooltip,
            "trigger",
            () => ({ id, payload: props.payload }),
            undefined,
            "button"
          ),
        // Until the tooltip it names mounts, a trigger outside the tooltip is a plain button.
        () =>
          renderUnbound(
            "button",
            { type: "button", ...attrs },
            { slots, state: { open: false } }
          )
      )
    },
  })
)

/**
 * The tooltip itself, positioned against its trigger.
 * @stable
 */
const TooltipContent = withPayload(
  withElement(
    "div",
    defineComponent({
      name: "TooltipContent",
      inheritAttrs: false,
      props: {
        side: String as PropType<Side>,
        align: String as PropType<"start" | "center" | "end">,
        sideOffset: Number,
        alignOffset: Number,
        collisionPadding: Number,
        arrowPadding: Number,
        anchor: [Object, String] as PropType<Anchor | string | null>,
        // Renders the popup into this element instead of in place.
        container: containerProp,
      },
      slots: Object as PartSlots<typeof tooltipPrimitive, "content">,
      setup(props) {
        const tooltip = useHandle(tooltipPrimitive)
        const fromRoot = inject(ContainerKey, () => undefined)
        const target = usePopupContainer(() => props.container ?? fromRoot())
        const content = () => {
          const { container, ...content } = copyProps(props)
          return content
        }
        const part = usePart(tooltip, "content", content)
        return () => {
          const element = part()
          return element && renderPopup(element, target())
        }
      },
    })
  )
)

/**
 * An arrow on the tooltip's edge that points at its trigger.
 * @stable
 */
const TooltipArrow = parts.Arrow

// The bound part of a shortcut, once its tooltip is known. It binds once, so it's
// keyed by the tooltip's instance and binds again when a trigger switches tooltips.
const ShortcutBinding = defineComponent({
  name: "TooltipShortcutBinding",
  inheritAttrs: false,
  props: {
    tooltip: { type: Object as PropType<TooltipContext>, required: true },
    shortcut: String,
  },
  setup(props, { slots }) {
    return usePart(
      props.tooltip,
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
 * Shows the tooltip's shortcut, like `⌘S`, formatted for the platform.
 * @stable
 */
const TooltipShortcut = withElement(
  "span",
  defineComponent({
    name: "TooltipShortcut",
    inheritAttrs: false,
    props: {
      // The keys to show. By default, the tooltip's shortcut.
      shortcut: String,
    },
    slots: Object as PartSlots<typeof tooltipPrimitive, "shortcut">,
    setup(props, { slots, attrs }) {
      const context = useScope(tooltipPrimitive)?.handle
      const trigger = inject(TriggerKey, null)
      if (!context && !trigger) {
        throw new Error("Tooltip parts must be used inside <Tooltip>.")
      }
      // A trigger outside the tooltip finds it through its controller only on the client.
      // Until mounted, its shortcut renders nothing, as on the server, so hydration matches.
      const mounted = ref(!!context)
      onMounted(() => (mounted.value = true))
      return () => {
        const tooltip = context ?? (mounted.value ? trigger?.() : undefined)
        // Inside a trigger whose tooltip hasn't mounted yet, there's no shortcut to show.
        if (!tooltip) {
          return null
        }
        return h(
          ShortcutBinding,
          {
            ...attrs,
            key: tooltip.instance.id,
            tooltip,
            shortcut: props.shortcut,
          },
          slots
        )
      }
    },
  })
)

export { createTooltipController } from "@ui-sdk/core/tooltip"
export type {
  TooltipApi,
  TooltipArrowState,
  TooltipContentProps,
  TooltipContentState,
  TooltipController,
  TooltipOpenChangeReason,
  TooltipOptions,
  TooltipPayloadChangeReason,
  TooltipPrimitive,
  TooltipShortcutProps,
  TooltipShortcutState,
  TooltipTriggerProps,
  TooltipTriggerState,
} from "@ui-sdk/core/tooltip"

export {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipShortcut,
  TooltipTrigger,
}
