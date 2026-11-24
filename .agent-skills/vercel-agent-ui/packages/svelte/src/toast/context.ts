import type {
  Toast as ToastData,
  ToastItem,
  toastRegion,
  ToastRegionOptions,
  ToastRegionState,
} from "@ui-sdk/core/toast"
import { getContext, type Snippet } from "svelte"
import type { SvelteHTMLElements } from "svelte/elements"
import type { PopupContainer } from "../popup.svelte"
import type { PrimitiveHandle, SlotAttributes } from "../use-primitive.svelte"

/**
 * What toasts can say in Svelte: text, or a snippet.
 * @stable
 */
type ToastContent = string | Snippet

type RegionHandle = PrimitiveHandle<typeof toastRegion>

/**
 * Props for `ToastRegion`: the section's attributes, the region's options, and
 * a snippet per toast. Built like `PartProps`, since `children` takes the
 * toast rather than the part's state.
 * @stable
 */
type ToastRegionProps = Omit<SvelteHTMLElements["section"], "children"> & {
  [attribute: string]: unknown
} & ToastRegionOptions & {
    /** Renders your own element. Receives the props to spread on it and the region's state. */
    render?: Snippet<[{ props: SlotAttributes; state: ToastRegionState }]>
    /** Renders each toast, usually with `Toast` and its parts. Without it, each toast renders its title, description, action and cancel button. */
    children?: Snippet<[ToastData<ToastContent>, ToastItem<ToastContent>]>
    /** Where the region renders. Without top layer support, the body. */
    container?: PopupContainer
  }

// The region and the toast a part belongs to.
type ToastContext = {
  region: RegionHandle
  toast: () => ToastData<ToastContent>
}

const ToastKey = Symbol("toast")

function useToast(part: string) {
  const context = getContext<ToastContext | undefined>(ToastKey)
  if (!context) {
    throw new Error(`${part} must be used inside <Toast>, in a <ToastRegion>.`)
  }
  return context
}

export {
  type RegionHandle,
  type ToastContent,
  type ToastContext,
  ToastKey,
  type ToastRegionProps,
  useToast,
}
