import {
  createToaster as createCoreToaster,
  toast as coreToast,
  toastRegion,
  type Toast as ToastData,
  type ToastActionProps,
  type ToastButtonState,
  type ToastCloseProps,
  type ToastItem,
  type ToastRegionOptions,
  type ToastRegionState,
  type ToastState,
  type Toaster,
} from "@ui-sdk/core/toast"
import type { ToastRegionInternalOptions } from "@ui-sdk/core/renderer"
import type { JSX } from "@solidjs/web"
import {
  createContext,
  createUniqueId,
  For,
  merge,
  omit,
  Show,
  untrack,
  useContext,
} from "solid-js"
import { renderPopup, type PopupContainer } from "./popup"
import {
  renderAs,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

type RegionHandle = PrimitiveHandle<typeof toastRegion>

// What toasts can say in Solid: text, or any element.
type Content = JSX.Element

// The region and the toast a part belongs to. The toast is a live view of the
// region's state, so a part that reads its title follows the toast's updates.
const ToastContext = createContext<{
  region: RegionHandle
  toast: ToastData<Content>
} | null>(null)

function useToast(part: string) {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error(`${part} must be used inside <Toast>, in a <ToastRegion>.`)
  }
  return context
}

// A live view of a value the region replaces on every change: reading a key
// in a tracking scope follows the value the region holds now, the way props
// do, so a toast's parts and a region's children render its updates in place.
function liveView<T extends object>(get: () => T, own: Partial<T> = {}) {
  const has = (key: PropertyKey) => key in own || key in get()
  const read = (key: PropertyKey) =>
    key in own
      ? own[key as keyof T]
      : (get() as Record<PropertyKey, unknown>)[key]
  return new Proxy(own as T, {
    get: (_, key) => read(key),
    has: (_, key) => has(key),
    ownKeys: () => [
      ...new Set([...Reflect.ownKeys(own), ...Reflect.ownKeys(get())]),
    ],
    getOwnPropertyDescriptor: (_, key) =>
      has(key)
        ? { enumerable: true, configurable: true, get: () => read(key) }
        : undefined,
  })
}

/**
 * Props for `ToastRegion`.
 * @stable
 */
type ToastRegionProps = Omit<
  PartProps<"section", ToastRegionState>,
  "children"
> &
  ToastRegionOptions & {
    /**
     * Renders each toast, usually with `Toast` and its parts. Without it,
     * each toast renders its title, description, action and cancel button.
     * Both arguments are live: reading a key in JSX follows the toast's updates.
     */
    children?: (
      toast: ToastData<Content>,
      item: ToastItem<Content>
    ) => JSX.Element
    /** Where the region renders. Without top layer support, the body. */
    container?: PopupContainer
  }

/**
 * Shows a toaster's toasts. Place it once, or let `<OverlayHost />` render it.
 * @stable
 */
function ToastRegion(props: ToastRegionProps) {
  return <Region {...props} placed />
}

// The region, placed by the app or rendered by the overlay host.
const Region = /* @__PURE__ */ rootScope(function Region(
  props: ToastRegionProps & { placed?: boolean }
) {
  const region = usePrimitive(
    toastRegion,
    () =>
      ({
        toaster: props.toaster,
        side: props.side,
        align: props.align,
        maxVisible: props.maxVisible,
        expanded: props.expanded,
        shortcut: props.shortcut,
        pendingAnnouncement: props.pendingAnnouncement,
        debug: props.debug,
        placed: props.placed,
        // Solid lets `false` remove an attribute, which is no name.
        label: props["aria-label"] || undefined,
      }) satisfies ToastRegionInternalOptions
  )
  const rest = omit(
    props,
    "toaster",
    "side",
    "align",
    "maxVisible",
    "expanded",
    "shortcut",
    "pendingAnnouncement",
    "debug",
    "placed",
    "container",
    "children",
    "aria-label"
  )
  const list = region.slot("list")
  const user = merge(rest, {
    get children() {
      return (state: ToastRegionState) => (
        <ol {...list}>
          <For each={state.toasts} keyed={(item) => item.toast.id}>
            {(item) => {
              const toast = liveView(() => item().toast as ToastData<Content>)
              const live = liveView(() => item() as ToastItem<Content>, {
                toast,
              })
              return (
                <ToastContext value={{ region, toast }}>
                  {untrack(() =>
                    props.children ? (
                      props.children(toast, live)
                    ) : (
                      <DataToast toast={toast} />
                    )
                  )}
                </ToastContext>
              )
            }}
          </For>
        </ol>
      )
    },
  })
  const element = () => usePart(region, "region", undefined, user, "section")
  return renderPopup(element, () => props.container)
})

// A toast rendered from its data, with the parts.
function DataToast(props: { toast: ToastData<Content> }) {
  return (
    <Toast>
      <div>
        <Show when={props.toast.title != null}>
          <ToastTitle />
        </Show>
        <Show when={props.toast.description != null}>
          <ToastDescription />
        </Show>
      </div>
      <Show when={props.toast.action}>
        <ToastAction />
      </Show>
      <Show when={props.toast.cancel}>
        <ToastClose action={props.toast.cancel?.onCancel}>
          {props.toast.cancel?.label}
        </ToastClose>
      </Show>
    </Toast>
  )
}

/**
 * One toast. Swipe it toward the region's side, or press Escape on it, to dismiss it.
 * @stable
 */
function Toast(props: PartProps<"li", ToastState>) {
  const { region, toast } = useToast("Toast")
  // The id keys the part and never changes, so it's read once.
  const id = untrack(() => toast.id)
  return usePart(region, "root", () => ({ id }), props, "li")
}

/**
 * The toast's title. Renders the toast's `title` when it has no children, and nothing when it has neither.
 * @stable
 */
function ToastTitle(props: PartProps<"div">) {
  const { region, toast } = useToast("ToastTitle")
  const id = untrack(() => toast.id)
  const rest = merge(omit(props, "children"), {
    get children() {
      return props.children ?? toast.title
    },
  })
  return (
    <Show when={"children" in props || toast.title != null}>
      {usePart(region, "title", () => ({ id }), rest, "div")}
    </Show>
  )
}

/**
 * The toast's description. Renders the toast's `description` when it has no children, and nothing when it has neither.
 * @stable
 */
function ToastDescription(props: PartProps<"div">) {
  const { region, toast } = useToast("ToastDescription")
  const id = untrack(() => toast.id)
  const rest = merge(omit(props, "children"), {
    get children() {
      return props.children ?? toast.description
    },
  })
  return (
    <Show when={"children" in props || toast.description != null}>
      {usePart(region, "description", () => ({ id }), rest, "div")}
    </Show>
  )
}

/**
 * The toast's action, like Undo. Renders the toast's `action` label when it
 * has no children, as a link when the action has an `href`. A Promise from its
 * handler keeps the toast open and the button pending.
 * @stable
 */
function ToastAction(
  props: Omit<PartProps<"button", ToastButtonState>, "onAction"> &
    ToastActionProps
) {
  const { region, toast } = useToast("ToastAction")
  const id = createUniqueId()
  const toastId = untrack(() => toast.id)
  const part = () => ({
    id,
    toast: toastId,
    onAction: props.onAction,
    dismiss: props.dismiss,
  })
  const rest = omit(props, "onAction", "dismiss", "children")
  const href = () => toast.action?.href
  // A link when the action has an `href`, else a button. The user's own
  // `render` and `href` win, since they come later in the merge.
  const element = {
    render: renderAs(() => (href() ? "a" : "button")),
    get href() {
      return href()
    },
    get type() {
      return href() ? undefined : "button"
    },
  }
  return (
    <Show when={toast.action || props.onAction}>
      {usePart(
        region,
        "action",
        part,
        merge(element, rest, {
          get children() {
            return props.children ?? toast.action?.label
          },
        }),
        "button"
      )}
    </Show>
  )
}

/**
 * Closes the toast. With an `action`, runs it first, and a returned Promise keeps the toast open until it settles.
 * @stable
 */
function ToastClose(
  props: Omit<PartProps<"button", ToastButtonState>, "action"> & ToastCloseProps
) {
  const { region, toast } = useToast("ToastClose")
  const id = createUniqueId()
  const toastId = untrack(() => toast.id)
  const part = () => ({ id, toast: toastId, action: props.action })
  const rest = omit(props, "action")
  return usePart(
    region,
    "close",
    part,
    merge({ type: "button" as const }, rest),
    "button"
  )
}

/**
 * Shows a toast from anywhere: `toast("Saved")`, `toast.success(...)`,
 * `toast.promise(save(), { loading, success, error })`. Content can be any
 * element.
 * @stable
 */
const toast = coreToast as Toaster<Content>

/**
 * Creates a queue of toasts and the function that adds to it, for a second
 * region with its own toasts. Pass it to that region as `toaster`.
 * @stable
 */
const createToaster = createCoreToaster as <ToastContent = Content>(
  options?: Parameters<typeof createCoreToaster>[0]
) => Toaster<ToastContent>

export {
  createToaster,
  Region,
  toast,
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastRegion,
  type ToastRegionProps,
  ToastTitle,
}
