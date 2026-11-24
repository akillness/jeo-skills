import type { ChangeDetails } from "@ui-sdk/core"
import type {
  DialogCloseProps,
  DialogFinalFocus,
  DialogInitialFocus,
} from "@ui-sdk/core/dialog"
import {
  drawer as drawerPrimitive,
  type DrawerController,
  type DrawerDismissAttemptDetails,
  type DrawerDriver,
  type DrawerKeyframes,
  type DrawerOpenChangeReason,
  type DrawerPayloadChangeReason,
  type DrawerSide,
  type DrawerSnapPointChangeReason,
  type SheetPhysics,
  type SnapPoint,
} from "@ui-sdk/core/drawer"
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

type OpenDetails = ChangeDetails<DrawerOpenChangeReason> & {
  returnValue?: string
}
type DrawerContext = PrimitiveHandle<typeof drawerPrimitive>

// Where the drawer renders. Set on the root or the content.
const ContainerKey: InjectionKey<() => PopupContainer> =
  Symbol("Drawer-container")
// The trigger a Shortcut part sits in: its shortcut, and the drawer it opens. A trigger
// connected through a controller sits outside the drawer, so its drawer comes from here.
const TriggerKey: InjectionKey<{
  shortcut: () => string | undefined
  drawer: () => DrawerContext | undefined
}> = Symbol("drawer-trigger")

const useDrawer = () => useHandle(drawerPrimitive)

const parts = createParts(drawerPrimitive, {
  handle: "button",
  title: "h2",
  description: "p",
})

const snapPointProp = {
  type: [Number, String] as PropType<SnapPoint | null>,
  default: undefined,
}

/**
 * A dialog presented as a sheet that slides in from an edge. Put its trigger, backdrop and content inside.
 * @stable
 */
const Drawer = /* @__PURE__ */ renderless(
  defineComponent({
    name: "Drawer",
    props: {
      open: optionalBoolean,
      modelValue: optionalBoolean,
      defaultOpen: optionalBoolean,
      modal: {
        type: [Boolean, String] as PropType<boolean | "trap-focus">,
        default: undefined,
      },
      closeOnOutsidePress: optionalBoolean,
      controller: Object as PropType<DrawerController<any, any>>,
      dismissible: optionalBoolean,
      persistentElements: [Array, Function] as PropType<
        (Element | string)[] | (() => Element[])
      >,
      pendingAnnouncement: String,
      debug: optionalBoolean,
      container: containerProp,
      snapPoints: Array as PropType<SnapPoint[]>,
      snapPoint: snapPointProp,
      defaultSnapPoint: {
        type: [Number, String] as PropType<SnapPoint>,
        default: undefined,
      },
      side: String as PropType<DrawerSide>,
      modalAbove: {
        type: [Number, String] as PropType<SnapPoint>,
        default: undefined,
      },
      driver: String as PropType<DrawerDriver>,
      expandOnScroll: optionalBoolean,
      physics: Object as PropType<Partial<SheetPhysics>>,
      themeColor: optionalBoolean,
      preventEdgeSwipe: optionalBoolean,
    },
    emits: {
      "update:open": (_open: boolean) => true,
      "update:modelValue": (_open: boolean) => true,
      openChange: (_open: boolean, _details: OpenDetails) => true,
      openChangeComplete: (_open: boolean) => true,
      payloadChange: (
        _payload: unknown,
        _details: ChangeDetails<DrawerPayloadChangeReason>
      ) => true,
      dismissAttempt: (_details: DrawerDismissAttemptDetails) => true,
      "update:snapPoint": (_snapPoint: SnapPoint) => true,
      snapPointChange: (
        _snapPoint: SnapPoint,
        _details: ChangeDetails<DrawerSnapPointChangeReason>
      ) => true,
    },
    setup(props, { slots, emit }) {
      provide(ContainerKey, () => props.container)
      const drawer = usePrimitive(drawerPrimitive, () => ({
        ...(props as Record<string, any>),
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
        onPayloadChange: (
          payload: unknown,
          details: ChangeDetails<DrawerPayloadChangeReason>
        ) => emit("payloadChange", payload, details),
        onDismissAttempt: (details: DrawerDismissAttemptDetails) =>
          emit("dismissAttempt", details),
        onSnapPointChange: (
          snapPoint: SnapPoint,
          details: ChangeDetails<DrawerSnapPointChangeReason>
        ) => {
          emit("snapPointChange", snapPoint, details)
          if (!details.canceled) {
            emit("update:snapPoint", snapPoint)
          }
        },
      }))
      useControllerEntry(() => props.controller, drawer)
      return () => slots.default?.()
    },
  })
)

/**
 * The button that opens the drawer. A trigger outside the drawer, like one per table row, connects through
 * `controller`.
 * @stable
 */
const DrawerTrigger = withElement(
  "button",
  defineComponent({
    name: "DrawerTrigger",
    inheritAttrs: false,
    props: {
      disabled: optionalBoolean,
      focusableWhenDisabled: optionalBoolean,
      payload: null as unknown as PropType<unknown>,
      // A keyboard shortcut that presses the trigger, like "mod+k".
      shortcut: String,
      // Connects a trigger outside the drawer to the drawer with this controller.
      controller: Object as PropType<DrawerController<any, any>>,
    },
    slots: Object as PartSlots<typeof drawerPrimitive, "trigger">,
    setup(props, { slots, attrs }) {
      const connected = useControllerTarget(
        drawerPrimitive,
        () => props.controller
      )
      provide(TriggerKey, { shortcut: () => props.shortcut, drawer: connected })
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
        (drawer) => usePart(drawer, "trigger", part, undefined, "button"),
        // Until the drawer it names mounts, a trigger outside the drawer is a plain button.
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
 * A dim behind the drawer. Its opacity follows the drawer, so give it a color like `bg-black/20`.
 * @stable
 */
const DrawerBackdrop = withElement(
  "div",
  defineComponent({
    name: "DrawerBackdrop",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof drawerPrimitive, "backdrop">,
    setup() {
      const target = usePopupContainer(inject(ContainerKey, () => undefined))
      const part = usePart(useDrawer(), "backdrop")
      return () => {
        const element = part()
        return element && renderPopup(element, target())
      }
    },
  })
)

/**
 * The sheet itself, a dialog, inside a full-screen viewport the drawer positions it in.
 * @stable
 */
const DrawerContent = withPayload(
  withElement(
    "div",
    defineComponent({
      name: "DrawerContent",
      inheritAttrs: false,
      props: {
        initialFocus: [
          String,
          Object,
          Function,
        ] as PropType<DialogInitialFocus>,
        finalFocus: [String, Object, Function] as PropType<DialogFinalFocus>,
        keepMounted: optionalBoolean,
        // Renders the drawer into this element instead of in place.
        container: containerProp,
      },
      slots: Object as PartSlots<typeof drawerPrimitive, "content">,
      setup(props) {
        const drawer = useDrawer()
        const fromRoot = inject(ContainerKey, () => undefined)
        const target = usePopupContainer(() => props.container ?? fromRoot())
        const content = () => ({
          initialFocus: props.initialFocus,
          finalFocus: props.finalFocus,
          keepMounted: props.keepMounted,
        })
        const part = usePart(drawer, "content", content)
        return () => {
          const element = part()
          if (!element) {
            return null
          }
          return renderPopup(sheetViewport(drawer, element), target())
        }
      },
    })
  )
)

/**
 * The grabber. Pressing it moves to the next snap point; arrow keys, Home and End step.
 * @stable
 */
const DrawerHandle = parts.Handle

/**
 * The drawer's title, which names it. A level 2 heading by default.
 * @stable
 */
const DrawerTitle = parts.Title
/**
 * Describes the drawer while it's rendered. A paragraph by default.
 * @stable
 */
const DrawerDescription = parts.Description

// A drawer's Close part is a dialog's.
type CloseAction = NonNullable<DialogCloseProps["action"]>

/**
 * A button that closes the drawer. An `action` runs first, and a Promise it returns keeps the drawer open
 * until it settles.
 * @stable
 */
const DrawerClose = withElement(
  "button",
  defineComponent({
    name: "DrawerClose",
    inheritAttrs: false,
    props: {
      // Reported as `returnValue` when this closes the drawer.
      value: String,
      // Runs before the drawer closes. A returned Promise keeps it open and pending until it settles.
      action: Function as PropType<CloseAction>,
      // `@action="save"` binds here, so the part gets the handler's Promise.
      onAction: Function as PropType<CloseAction>,
    },
    slots: Object as PartSlots<typeof drawerPrimitive, "close">,
    setup(props) {
      // Keyed by its own id, so several Close parts stay apart.
      const id = useId()
      const part = () => ({
        id,
        value: props.value,
        action: props.action ?? props.onAction,
      })
      return usePart(useDrawer(), "close", part, undefined, "button")
    },
  })
)

// The bound part of a shortcut, once its drawer is known. It binds once, so it's
// keyed by the drawer's instance and binds again when a trigger switches drawers.
const ShortcutBinding = defineComponent({
  name: "DrawerShortcutBinding",
  inheritAttrs: false,
  props: {
    drawer: { type: Object as PropType<DrawerContext>, required: true },
    shortcut: String,
  },
  setup(props, { slots }) {
    return usePart(
      props.drawer,
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
 * Shows a trigger's shortcut, like ⌘K, inside the trigger. Hidden from screen readers, which hear
 * aria-keyshortcuts.
 * @stable
 */
const DrawerShortcut = withElement(
  "span",
  defineComponent({
    name: "DrawerShortcut",
    inheritAttrs: false,
    props: {
      // The keys to show. Inside a trigger, its shortcut.
      shortcut: String,
    },
    slots: Object as PartSlots<typeof drawerPrimitive, "shortcut">,
    setup(props, { slots, attrs }) {
      const context = useScope(drawerPrimitive)?.handle
      const trigger = inject(TriggerKey, null)
      if (!context && !trigger) {
        throw new Error("Drawer parts must be used inside <Drawer>.")
      }
      // A trigger outside the drawer finds it through its controller only on the client.
      // Until mounted, its shortcut renders nothing, as on the server, so hydration matches.
      const mounted = ref(!!context)
      onMounted(() => (mounted.value = true))
      return () => {
        const drawer =
          context ?? (mounted.value ? trigger?.drawer() : undefined)
        // Inside a trigger whose drawer hasn't mounted yet, there's no shortcut to show.
        if (!drawer) {
          return null
        }
        const shortcut = props.shortcut ?? trigger?.shortcut()
        return h(
          ShortcutBinding,
          { ...attrs, key: drawer.instance.id, drawer, shortcut },
          slots
        )
      }
    },
  })
)

// The bound part of an outlet, once its drawer is known.
const OutletBinding = defineComponent({
  name: "DrawerOutletBinding",
  inheritAttrs: false,
  props: {
    drawer: { type: Object as PropType<DrawerContext>, required: true },
    keyframes: Object as PropType<DrawerKeyframes>,
  },
  setup(props) {
    const id = useId()
    return usePart(props.drawer, "outlet", () => ({
      id,
      keyframes: props.keyframes,
    }))
  },
})

/**
 * An element that follows the drawer, like the page behind it. Outside the drawer, pass its `controller`.
 * @stable
 */
const DrawerOutlet = withElement(
  "div",
  defineComponent({
    name: "DrawerOutlet",
    inheritAttrs: false,
    props: {
      // Keyframes it plays as the drawer expands, like `{ scale: [1, 0.94] }`.
      keyframes: Object as PropType<DrawerKeyframes>,
      controller: Object as PropType<DrawerController<any, any>>,
    },
    slots: Object as PartSlots<typeof drawerPrimitive, "outlet">,
    setup(props, { slots, attrs }) {
      const connected = useControllerTarget(
        drawerPrimitive,
        () => props.controller
      )
      return () => {
        const drawer = connected()
        if (!drawer) {
          return renderUnbound(
            "div",
            { ...attrs },
            { slots, state: { open: false } }
          )
        }
        // A binding takes its drawer once, so another drawer gets a new one.
        return h(
          OutletBinding,
          {
            ...attrs,
            key: drawer.instance.id,
            drawer,
            keyframes: props.keyframes,
          },
          slots
        )
      }
    },
  })
)

export { createDrawerController, sheetPhysics } from "@ui-sdk/core/drawer"
export type {
  DrawerApi,
  DrawerBackdropState,
  DrawerContentProps,
  DrawerContentState,
  DrawerController,
  DrawerDismissAttemptDetails,
  DrawerDismissReason,
  DrawerDriver,
  DrawerHandleState,
  DrawerKeyframes,
  DrawerOpenChangeReason,
  DrawerOptions,
  DrawerOutletProps,
  DrawerOutletState,
  DrawerPayloadChangeReason,
  DrawerPrimitive,
  DrawerSide,
  DrawerSnapPointChangeReason,
  DrawerTriggerProps,
  SheetPhysics,
  SnapPoint,
} from "@ui-sdk/core/drawer"

export {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerOutlet,
  DrawerShortcut,
  DrawerTitle,
  DrawerTrigger,
}
