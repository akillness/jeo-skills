import type { Anchor, ChangeDetails, Side } from "@ui-sdk/core"
import {
  hoverCard as hoverCardPrimitive,
  type HoverCardController,
  type HoverCardOpenChangeReason,
  type HoverCardPayloadChangeReason,
} from "@ui-sdk/core/hover-card"
import {
  defineComponent,
  inject,
  provide,
  useId,
  type InjectionKey,
  type PropType,
} from "vue"
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
  optionalBoolean,
  orModel,
  useHandle,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"
import { renderless } from "./renderless"

type OpenDetails = ChangeDetails<HoverCardOpenChangeReason>
type PayloadDetails = ChangeDetails<HoverCardPayloadChangeReason>

// Where the popup renders. Set on <HoverCard> or <HoverCardContent>.
const ContainerKey: InjectionKey<() => PopupContainer> = Symbol(
  "hover-card-container"
)

const parts = createParts(hoverCardPrimitive, { arrow: "div" })

/**
 * A preview of what a link points to, shown when the pointer rests on the link or keyboard focus stays on it.
 * @stable
 */
const HoverCard = /* @__PURE__ */ renderless(
  defineComponent({
    name: "HoverCard",
    props: {
      open: optionalBoolean,
      modelValue: optionalBoolean,
      defaultOpen: optionalBoolean,
      delay: Number,
      closeDelay: Number,
      disabled: optionalBoolean,
      controller: Object as PropType<HoverCardController<any>>,
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
      const hoverCard = usePrimitive(hoverCardPrimitive, () => ({
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
        onPayloadChange: (payload: unknown, details: PayloadDetails) =>
          emit("payloadChange", payload, details),
      }))
      useControllerEntry(() => props.controller, hoverCard)
      return () => slots.default?.()
    },
  })
)

/**
 * A link by default: pressing it follows the link, and hover or focus opens the card.
 * @stable
 */
const HoverCardTrigger = withElement(
  "a",
  defineComponent({
    name: "HoverCardTrigger",
    inheritAttrs: false,
    props: {
      payload: null as unknown as PropType<unknown>,
      // Connects a trigger outside the card to the card with this controller.
      controller: Object as PropType<HoverCardController<any>>,
    },
    slots: Object as PartSlots<typeof hoverCardPrimitive, "trigger">,
    setup(props, { slots, attrs }) {
      const connected = useControllerTarget(
        hoverCardPrimitive,
        () => props.controller
      )
      const id = useId()
      return useConnectedPart(
        connected,
        (hoverCard) =>
          usePart(
            hoverCard,
            "trigger",
            () => ({ id, payload: props.payload }),
            undefined,
            "a"
          ),
        // Until the card it names mounts, a trigger outside the card is a plain link.
        () => renderUnbound("a", attrs, { slots, state: { open: false } })
      )
    },
  })
)

/**
 * The card itself, positioned against its trigger.
 * @stable
 */
const HoverCardContent = withPayload(
  withElement(
    "div",
    defineComponent({
      name: "HoverCardContent",
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
        // Renders the popup into this element instead of in place.
        container: containerProp,
      },
      slots: Object as PartSlots<typeof hoverCardPrimitive, "content">,
      setup(props) {
        const hoverCard = useHandle(hoverCardPrimitive)
        const fromRoot = inject(ContainerKey, () => undefined)
        const target = usePopupContainer(() => props.container ?? fromRoot())
        const content = () => {
          const { container, ...content } = props
          return content
        }
        const part = usePart(hoverCard, "content", content)
        return () => {
          const element = part()
          return element && renderPopup(element, target())
        }
      },
    })
  )
)

/**
 * An arrow on the card's edge that points at its trigger.
 * @stable
 */
const HoverCardArrow = parts.Arrow

export { createHoverCardController } from "@ui-sdk/core/hover-card"
export type {
  HoverCardApi,
  HoverCardArrowState,
  HoverCardContentProps,
  HoverCardContentState,
  HoverCardController,
  HoverCardOpenChangeReason,
  HoverCardOptions,
  HoverCardPayloadChangeReason,
  HoverCardPrimitive,
  HoverCardTriggerProps,
  HoverCardTriggerState,
} from "@ui-sdk/core/hover-card"

export { HoverCard, HoverCardArrow, HoverCardContent, HoverCardTrigger }
