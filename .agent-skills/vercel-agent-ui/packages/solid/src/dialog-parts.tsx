import type {
  AlertDialogController,
  dialog as dialogPrimitive,
  DialogBackdropState,
  DialogContentProps,
  DialogContentState,
  DialogController,
  DialogOptions,
  DialogShortcutProps,
  DialogShortcutState,
  DialogTriggerProps,
  DialogTriggerState,
} from "@ui-sdk/core/dialog"
import type { JSX } from "@solidjs/web"
import {
  createContext,
  createUniqueId,
  merge,
  omit,
  Show,
  useContext,
} from "solid-js"
import {
  popupPart,
  useControllerEntry,
  useControllerTarget,
  usePopupContainer,
  type PopupContainer,
  type sheetViewport,
} from "./popup"
import {
  createParts,
  providePrimitive,
  renderStatic,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

type DialogContextValue = PrimitiveHandle<typeof dialogPrimitive>

type TriggerPartProps = Omit<
  PartProps<"button", DialogTriggerState>,
  "value" | "onChange"
> &
  Omit<DialogTriggerProps, "controller">
type ContentPartProps<Payload = unknown> = PartProps<
  "div",
  DialogContentState<Payload>
> &
  DialogContentProps
type ShortcutPartProps = PartProps<"span", DialogShortcutState> &
  DialogShortcutProps

// The trigger a Shortcut part sits in: its shortcut, and the dialog it opens. A trigger
// connected through a controller sits outside the dialog, so its dialog comes from here.
const TriggerContext = createContext<{
  shortcut: () => string | undefined
  dialog: () => DialogContextValue | undefined
} | null>(null)

// Dialog and AlertDialog render the same parts over their own primitive.
// `viewport` renders the viewport around the content, for a dialog that can present as a sheet.
function createDialogParts(
  primitive: typeof dialogPrimitive,
  name: string,
  viewport?: typeof sheetViewport
) {
  const parts = createParts(primitive, {
    title: "h2",
    description: "p",
    close: "button",
  })
  // The dialog, for the parts that may find it through a controller or render in a popup.
  const Context = createContext<DialogContextValue | null>(null)
  // Where the popup renders. Set on the root or the content.
  const ContainerContext = createContext<() => PopupContainer>(() => undefined)

  function useDialog() {
    const context = useContext(Context)
    if (!context) {
      throw new Error(`${name} parts must be used inside <${name}>.`)
    }
    return context
  }

  const Root = rootScope(function Root(
    props: DialogOptions & { children?: JSX.Element }
  ) {
    const options = omit(props, "children", "container")
    const dialog = usePrimitive(primitive, () => ({ ...options }))
    useControllerEntry(() => props.controller, dialog)
    return providePrimitive(dialog, () => (
      <Context value={dialog}>
        <ContainerContext value={() => props.container}>
          {props.children}
        </ContainerContext>
      </Context>
    ))
  })

  function Trigger(
    props: TriggerPartProps & {
      controller?: DialogController<any, any> | AlertDialogController<any, any>
    }
  ) {
    const dialog = useControllerTarget(
      () => props.controller,
      useContext(Context)
    )
    const rest = omit(
      props,
      "disabled",
      "focusableWhenDisabled",
      "payload",
      "shortcut",
      "controller"
    )
    return (
      <TriggerContext value={{ shortcut: () => props.shortcut, dialog }}>
        <Show
          when={dialog()}
          keyed
          // Until the dialog it names mounts, a trigger outside the dialog is a plain button.
          fallback={renderStatic(
            "button",
            () => ({
              attrs: {},
              state: { open: false, disabled: !!props.disabled },
            }),
            merge(rest, {
              type: "button",
              get disabled() {
                return props.disabled && !props.focusableWhenDisabled
              },
              get "aria-disabled"() {
                return (
                  (props.disabled && props.focusableWhenDisabled) || undefined
                )
              },
            })
          )}
        >
          {(dialog) => {
            const id = createUniqueId()
            const trigger = () => ({
              id,
              disabled: props.disabled,
              focusableWhenDisabled: props.focusableWhenDisabled,
              payload: props.payload,
              shortcut: props.shortcut,
            })
            return usePart(dialog, "trigger", trigger, rest, "button")
          }}
        </Show>
      </TriggerContext>
    )
  }

  function Backdrop(props: PartProps<"div", DialogBackdropState>) {
    const target = usePopupContainer(useContext(ContainerContext))
    return popupPart(useDialog(), "backdrop", () => ({}), props, target)
  }

  function Content<Payload = unknown>(props: ContentPartProps<Payload>) {
    const fromRoot = useContext(ContainerContext)
    const target = usePopupContainer(() => props.container ?? fromRoot())
    const content = () => ({
      initialFocus: props.initialFocus,
      finalFocus: props.finalFocus,
      keepMounted: props.keepMounted,
      inline: props.inline,
    })
    const rest = omit(
      props,
      "initialFocus",
      "finalFocus",
      "keepMounted",
      "inline",
      "container"
    )
    return popupPart(
      useDialog(),
      "content",
      content,
      rest,
      target,
      viewport,
      () => props.inline
    )
  }

  function Shortcut(props: ShortcutPartProps) {
    const trigger = useContext(TriggerContext)
    const context = useContext(Context)
    if (!context && !trigger) {
      throw new Error(`${name} parts must be used inside <${name}>.`)
    }
    // A trigger outside the dialog finds it through its controller only once
    // mounted, so inside one whose dialog hasn't mounted yet, there's no
    // shortcut to show, as on the server.
    const dialog = () => context ?? trigger?.dialog()
    const shortcut = () => ({ shortcut: props.shortcut ?? trigger?.shortcut() })
    const rest = merge(omit(props, "shortcut"), {
      get children() {
        return props.children ?? ((state: DialogShortcutState) => state.text)
      },
    })
    return (
      <Show when={dialog()} keyed>
        {(dialog) => usePart(dialog, "shortcut", shortcut, rest, "span")}
      </Show>
    )
  }

  return {
    Root,
    Trigger,
    Backdrop,
    Content,
    Title: parts.Title,
    Description: parts.Description,
    Close: parts.Close,
    Shortcut,
  }
}

export { createDialogParts, type TriggerPartProps }
