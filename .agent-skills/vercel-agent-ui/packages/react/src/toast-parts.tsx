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
import * as React from "react"
import { renderPopup, type PopupContainer } from "./popup"
import {
  slotIn,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

type RegionHandle = PrimitiveHandle<typeof toastRegion>

// The region and the toast a part belongs to.
const ToastContext = React.createContext<{
  region: RegionHandle
  toast: ToastData<React.ReactNode>
} | null>(null)

function useToast(part: string) {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error(`${part} must be used inside <Toast>, in a <ToastRegion>.`)
  }
  return context
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
    /** Renders each toast, usually with `Toast` and its parts. Without it, each toast renders its title, description, action and cancel button. */
    children?: (
      toast: ToastData<React.ReactNode>,
      item: ToastItem<React.ReactNode>
    ) => React.ReactNode
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
function Region({
  toaster,
  side,
  align,
  maxVisible,
  expanded,
  shortcut,
  pendingAnnouncement,
  debug,
  placed,
  container,
  children,
  "aria-label": label,
  ...props
}: ToastRegionProps & { placed?: boolean }) {
  const region = usePrimitive(toastRegion, {
    toaster,
    side,
    align,
    maxVisible,
    expanded,
    shortcut,
    pendingAnnouncement,
    debug,
    placed,
    label,
  } satisfies ToastRegionInternalOptions)
  // Each toast with its parts, which read it from context.
  const list = (state: ToastRegionState) => (
    <ol {...slotIn(region, "list")}>
      {state.toasts.map((item: ToastItem) => {
        const toast = item.toast as ToastData<React.ReactNode>
        return (
          <ToastContext.Provider key={toast.id} value={{ region, toast }}>
            {children ? (
              children(toast, item as ToastItem<React.ReactNode>)
            ) : (
              <DataToast toast={toast} />
            )}
          </ToastContext.Provider>
        )
      })}
    </ol>
  )
  const element = usePart(
    region,
    "region",
    {},
    { ...props, children: list },
    "section"
  )
  return element && renderPopup(element, container)
}

// A toast rendered from its data, with the parts.
function DataToast({ toast }: { toast: ToastData<React.ReactNode> }) {
  return (
    <Toast>
      <div>
        {toast.title != null && <ToastTitle />}
        {toast.description != null && <ToastDescription />}
      </div>
      {toast.action && <ToastAction />}
      {toast.cancel && (
        <ToastClose action={toast.cancel.onCancel}>
          {toast.cancel.label}
        </ToastClose>
      )}
    </Toast>
  )
}

/**
 * One toast. Swipe it toward the region's side, or press Escape on it, to dismiss it.
 * @stable
 */
function Toast(props: PartProps<"li", ToastState>) {
  const { region, toast } = useToast("Toast")
  return usePart(region, "root", { id: toast.id }, props, "li")
}

/**
 * The toast's title. Renders the toast's `title` when it has no children, and nothing when it has neither.
 * @stable
 */
function ToastTitle({ children, ...props }: PartProps<"div">) {
  const { toast } = useToast("ToastTitle")
  const content = children ?? toast.title
  return content == null ? null : (
    <TextPart text="title" {...props}>
      {content}
    </TextPart>
  )
}

/**
 * The toast's description. Renders the toast's `description` when it has no children, and nothing when it has neither.
 * @stable
 */
function ToastDescription({ children, ...props }: PartProps<"div">) {
  const { toast } = useToast("ToastDescription")
  const content = children ?? toast.description
  return content == null ? null : (
    <TextPart text="description" {...props}>
      {content}
    </TextPart>
  )
}

// A title or description with content to show.
function TextPart({
  text,
  ...props
}: PartProps<"div"> & { text: "title" | "description" }) {
  const { region, toast } = useToast("ToastTitle")
  return usePart(region, text, { id: toast.id }, props)
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
  const { toast } = useToast("ToastAction")
  return toast.action || props.onAction ? <ActionPart {...props} /> : null
}

function ActionPart({
  onAction,
  dismiss,
  children,
  ...props
}: Omit<PartProps<"button", ToastButtonState>, "onAction"> & ToastActionProps) {
  const { region, toast } = useToast("ToastAction")
  const href = toast.action?.href
  const part = { id: React.useId(), toast: toast.id, onAction, dismiss }
  const element = {
    ...(href ? { href } : { type: "button" }),
    ...props,
    children: children ?? toast.action?.label,
  }
  // A link or a button, whose props are typed as the button's.
  return usePart(
    region,
    "action",
    part,
    element as PartProps<"button", ToastButtonState>,
    href ? "a" : "button"
  )
}

/**
 * Closes the toast. With an `action`, runs it first, and a returned Promise keeps the toast open until it settles.
 * @stable
 */
function ToastClose({
  action,
  ...props
}: Omit<PartProps<"button", ToastButtonState>, "action"> & ToastCloseProps) {
  const { region, toast } = useToast("ToastClose")
  const part = { id: React.useId(), toast: toast.id, action }
  return usePart(region, "close", part, { type: "button", ...props }, "button")
}

/**
 * Shows a toast from anywhere: `toast("Saved")`, `toast.success(...)`,
 * `toast.promise(save(), { loading, success, error })`. Content can be any
 * React node.
 * @stable
 */
const toast = coreToast as Toaster<React.ReactNode>

/**
 * Creates a queue of toasts and the function that adds to it, for a second
 * region with its own toasts. Pass it to that region as `toaster`.
 * @stable
 */
const createToaster = createCoreToaster as <Content = React.ReactNode>(
  options?: Parameters<typeof createCoreToaster>[0]
) => Toaster<Content>

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
