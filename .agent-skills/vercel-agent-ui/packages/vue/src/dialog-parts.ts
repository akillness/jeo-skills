import type { ChangeDetails } from "@ui-sdk/core"
import type {
  AlertDialogController,
  dialog as dialogPrimitive,
  DialogCloseProps,
  DialogController,
  DialogDismissAttemptDetails,
  DialogFinalFocus,
  DialogInitialFocus,
  DialogOpenChangeReason,
  DialogPayloadChangeReason,
} from "@ui-sdk/core/dialog"
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
  type SetupContext,
} from "vue"
import { slotContent } from "./children"
import {
  containerProp,
  type PopupContainer,
  renderPopup,
  renderUnbound,
  type sheetViewport,
  useConnectedPart,
  useControllerEntry,
  useControllerTarget,
  usePopupContainer,
  withPayload,
} from "./popup"
import { createParts, withElement } from "./create-parts"
import {
  optionalBoolean,
  useHandle,
  usePart,
  usePrimitive,
  useScope,
  type PrimitiveHandle,
  type PartSlots,
} from "./use-primitive"
import { renderless } from "./renderless"

type OpenDetails = ChangeDetails<DialogOpenChangeReason> & {
  returnValue?: string
}
type PayloadDetails = ChangeDetails<DialogPayloadChangeReason>
type CloseAction = NonNullable<DialogCloseProps["action"]>

type DialogContext = PrimitiveHandle<typeof dialogPrimitive>

// The trigger a Shortcut part sits in: its shortcut, and the dialog it opens. A trigger
// connected through a controller sits outside the dialog, so its dialog comes from here.
const TriggerKey: InjectionKey<{
  shortcut: () => string | undefined
  dialog: () => DialogContext | undefined
}> = Symbol("dialog-trigger")

// Dialog and AlertDialog render the same parts over their own primitive, each
// from its own module, so an app with only alert dialogs doesn't carry
// Dialog's presentation. `viewport` renders the viewport around the content,
// for a dialog that can present as a sheet.
function defineDialogParts(
  primitive: typeof dialogPrimitive,
  name: string,
  viewport?: typeof sheetViewport
) {
  // Where the popup renders. Set on the root or the content.
  const ContainerKey: InjectionKey<() => PopupContainer> = Symbol(
    `${name}-container`
  )
  const parts = createParts(primitive, { title: "h2", description: "p" })

  // The root's props. Dialog adds the ones an alert dialog doesn't take: it's
  // always modal and has no presentation.
  const sharedProps = {
    open: optionalBoolean,
    modelValue: optionalBoolean,
    defaultOpen: optionalBoolean,
    controller: Object as PropType<
      DialogController<any, any> | AlertDialogController<any, any>
    >,
    dismissible: optionalBoolean,
    persistentElements: [Array, Function] as PropType<
      (Element | string)[] | (() => Element[])
    >,
    pendingAnnouncement: String,
    debug: optionalBoolean,
    container: containerProp,
  }
  const emits = {
    "update:open": (_open: boolean) => true,
    "update:modelValue": (_open: boolean) => true,
    openChange: (_open: boolean, _details: OpenDetails) => true,
    openChangeComplete: (_open: boolean) => true,
    payloadChange: (_payload: unknown, _details: PayloadDetails) => true,
    dismissAttempt: (_details: DialogDismissAttemptDetails) => true,
  }
  const setup = (
    props: {
      container?: PopupContainer
      controller?: DialogController<any, any> | AlertDialogController<any, any>
    },
    { slots, emit }: SetupContext<typeof emits>
  ) => {
    provide(ContainerKey, () => props.container)
    const dialog = usePrimitive(primitive, () => ({
      ...(props as Record<string, any>),
      container: undefined,
      open:
        (props as { open?: boolean }).open ??
        (props as { modelValue?: boolean }).modelValue,
      onOpenChange: (open: boolean, details: OpenDetails) => {
        // The change event runs first, so canceling it also keeps v-model as it was.
        emit("openChange", open, details)
        if (details.canceled) {
          return
        }
        emit("update:open", open)
        emit("update:modelValue", open)
      },
      onOpenChangeComplete: (open: boolean) => emit("openChangeComplete", open),
      onPayloadChange: (payload: unknown, details: PayloadDetails) =>
        emit("payloadChange", payload, details),
      onDismissAttempt: (details: DialogDismissAttemptDetails) =>
        emit("dismissAttempt", details),
    }))
    useControllerEntry(() => props.controller, dialog)
    return () => slots.default?.()
  }
  const AlertRoot = renderless(
    defineComponent({
      name,
      props: sharedProps,
      emits,
      setup: (props, context) => setup(props, context),
    })
  )
  const Root = renderless(
    defineComponent({
      name,
      props: {
        ...sharedProps,
        modal: {
          type: [Boolean, String] as PropType<boolean | "trap-focus">,
          default: undefined,
        },
        closeOnOutsidePress: optionalBoolean,
        presentation: String as PropType<"auto" | "dialog" | "sheet">,
      },
      emits,
      setup: (props, context) => setup(props, context),
    })
  )

  const Trigger = withElement(
    "button",
    defineComponent({
      name: `${name}Trigger`,
      inheritAttrs: false,
      props: {
        disabled: optionalBoolean,
        focusableWhenDisabled: optionalBoolean,
        payload: null as unknown as PropType<unknown>,
        // A keyboard shortcut that presses the trigger, like "mod+k".
        shortcut: String,
        // Connects a trigger outside the dialog to the dialog with this controller.
        controller: Object as PropType<
          DialogController<any, any> | AlertDialogController<any, any>
        >,
      },
      slots: Object as PartSlots<typeof primitive, "trigger">,
      setup(props, { slots, attrs }) {
        const connected = useControllerTarget(primitive, () => props.controller)
        provide(TriggerKey, {
          shortcut: () => props.shortcut,
          dialog: connected,
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
          (dialog) => usePart(dialog, "trigger", part, undefined, "button"),
          // Until the dialog it names mounts, a trigger outside the dialog is a plain button.
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

  const Backdrop = withElement(
    "div",
    defineComponent({
      name: `${name}Backdrop`,
      inheritAttrs: false,
      slots: Object as PartSlots<typeof primitive, "backdrop">,
      setup() {
        const dialog = useHandle(primitive)
        const fromRoot = inject(ContainerKey, () => undefined)
        const backdropTarget = usePopupContainer(fromRoot)
        const part = usePart(dialog, "backdrop")
        return () => {
          const element = part()
          return element && renderPopup(element, backdropTarget())
        }
      },
    })
  )

  const Content = withPayload(
    withElement(
      "div",
      defineComponent({
        name: `${name}Content`,
        inheritAttrs: false,
        props: {
          initialFocus: [
            String,
            Object,
            Function,
          ] as PropType<DialogInitialFocus>,
          finalFocus: [String, Object, Function] as PropType<DialogFinalFocus>,
          keepMounted: optionalBoolean,
          inline: optionalBoolean,
          // Renders the popup into this element instead of in place.
          container: containerProp,
        },
        slots: Object as PartSlots<typeof primitive, "content">,
        setup(props) {
          const dialog = useHandle(primitive)
          const fromRoot = inject(ContainerKey, () => undefined)
          const target = usePopupContainer(() => props.container ?? fromRoot())
          const content = () => ({
            initialFocus: props.initialFocus,
            finalFocus: props.finalFocus,
            keepMounted: props.keepMounted,
            inline: props.inline,
          })
          const part = usePart(dialog, "content", content)
          return () => {
            const element = part()
            if (!element) {
              return null
            }
            const shown = viewport ? viewport(dialog, element) : element
            return props.inline ? shown : renderPopup(shown, target())
          }
        },
      })
    )
  )

  const Close = withElement(
    "button",
    defineComponent({
      name: `${name}Close`,
      inheritAttrs: false,
      props: {
        // Reported as `returnValue` when this closes the dialog.
        value: String,
        // Runs before the dialog closes. A returned Promise keeps it open and pending until it settles.
        action: Function as PropType<CloseAction>,
        // `@action="save"` binds here, so the part gets the handler's Promise.
        onAction: Function as PropType<CloseAction>,
      },
      slots: Object as PartSlots<typeof primitive, "close">,
      setup(props) {
        // Keyed by its own id, so several Close parts stay apart.
        const id = useId()
        const part = () => ({
          id,
          value: props.value,
          action: props.action ?? props.onAction,
        })
        return usePart(useHandle(primitive), "close", part, undefined, "button")
      },
    })
  )

  // The bound part of a shortcut, once its dialog is known. It binds once, so it's
  // keyed by the dialog's instance and binds again when a trigger switches dialogs.
  const ShortcutBinding = defineComponent({
    name: `${name}ShortcutBinding`,
    inheritAttrs: false,
    props: {
      dialog: { type: Object as PropType<DialogContext>, required: true },
      shortcut: String,
    },
    setup(props, { slots }) {
      return usePart(
        props.dialog,
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

  // Shows a trigger's shortcut, like ⌘K, inside the trigger. Hidden from screen readers, which hear aria-keyshortcuts.
  const Shortcut = withElement(
    "span",
    defineComponent({
      name: `${name}Shortcut`,
      inheritAttrs: false,
      props: {
        // The keys to show. Inside a trigger, its shortcut.
        shortcut: String,
      },
      slots: Object as PartSlots<typeof primitive, "shortcut">,
      setup(props, { slots, attrs }) {
        const context = useScope(primitive)?.handle
        const trigger = inject(TriggerKey, null)
        if (!context && !trigger) {
          throw new Error(`${name} parts must be used inside <${name}>.`)
        }
        // A trigger outside the dialog finds it through its controller only on the client.
        // Until mounted, its shortcut renders nothing, as on the server, so hydration matches.
        const mounted = ref(!!context)
        onMounted(() => (mounted.value = true))
        return () => {
          const dialog =
            context ?? (mounted.value ? trigger?.dialog() : undefined)
          // Inside a trigger whose dialog hasn't mounted yet, there's no shortcut to show.
          if (!dialog) {
            return null
          }
          const shortcut = props.shortcut ?? trigger?.shortcut()
          return h(
            ShortcutBinding,
            { ...attrs, key: dialog.instance.id, dialog, shortcut },
            slots
          )
        }
      },
    })
  )

  return {
    Root,
    AlertRoot,
    Trigger,
    Backdrop,
    Content,
    Title: parts.Title,
    Description: parts.Description,
    Close,
    Shortcut,
  }
}

export { defineDialogParts }
