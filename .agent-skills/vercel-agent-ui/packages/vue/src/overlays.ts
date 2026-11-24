import type { ConfirmEntry, ConfirmOptions } from "@ui-sdk/core/dialog"
import { toasterInternals } from "@ui-sdk/core/renderer"
import {
  overlays as sharedOverlays,
  type Overlays,
} from "@ui-sdk/core/overlays"
import type { Toaster, ToastItem } from "@ui-sdk/core/toast"
import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  onScopeDispose,
  shallowRef,
  type PropType,
  type Slot,
  type SlotsType,
  type VNode,
} from "vue"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "./alert-dialog"
import { HostedToastRegion, type ToastContent } from "./toast-parts"

/**
 * Props for the toast regions the overlay host renders: the region's props and attributes, like `class`.
 * @stable
 */
type OverlayHostToastProps = {
  side?: "top" | "bottom"
  align?: "start" | "center" | "end"
  max?: number
  expanded?: boolean
  shortcut?: string | null
  [attribute: string]: unknown
}

// A toaster's region, unless the app placed one of its own.
const HostedToaster = defineComponent({
  name: "HostedToaster",
  props: {
    toaster: { type: Function as unknown as PropType<Toaster>, required: true },
    regionProps: Object as PropType<OverlayHostToastProps>,
    renderToast: Function as PropType<Slot>,
  },
  setup(props) {
    const placed = shallowRef(toasterInternals(props.toaster).hasPlacedRegion())
    onScopeDispose(
      props.toaster.subscribe(
        () => (placed.value = toasterInternals(props.toaster).hasPlacedRegion())
      )
    )
    return () =>
      placed.value
        ? null
        : h(
            HostedToastRegion,
            { ...props.regionProps, toaster: props.toaster },
            props.renderToast && { default: props.renderToast }
          )
  },
})

const HostedConfirm = defineComponent({
  name: "HostedConfirm",
  props: {
    entry: { type: Object as PropType<ConfirmEntry>, required: true },
  },
  setup(props) {
    // The alert dialog attached the controller as it mounted, so it can open now.
    onMounted(() => props.entry.open())
    return () => {
      const { entry } = props
      const question = (entry.payload ?? {}) as Partial<ConfirmOptions>
      return h(
        AlertDialog,
        {
          controller: entry.controller,
          onOpenChangeComplete: (open: boolean) => !open && entry.done(),
        },
        () =>
          h(AlertDialogContent, null, () => [
            h(AlertDialogTitle, null, () => question.title),
            question.description
              ? h(AlertDialogDescription, null, () => question.description)
              : null,
            h("div", [
              h(AlertDialogClose, null, () => question.cancelLabel ?? "Cancel"),
              h(
                AlertDialogClose,
                { value: "confirm" },
                () => question.confirmLabel ?? "Continue"
              ),
            ]),
          ])
      )
    }
  },
})

/**
 * Renders what `toast()` and `confirm()` open, from anywhere in the app.
 * Mount it once, near the root. A `ToastRegion` you place yourself takes over
 * its toaster.
 * @stable
 */
const OverlayHost = defineComponent({
  name: "OverlayHost",
  props: {
    // The registry it renders. Defaults to the shared `overlays`, which toast() and confirm() open into.
    overlays: Object as PropType<Overlays>,
    // Props for the toast regions it renders, like `side` and `class`.
    toast: Object as PropType<OverlayHostToastProps>,
  },
  slots: Object as SlotsType<{
    /** Renders each toast of the regions it renders, like a `ToastRegion`'s default slot: `#toast="{ toast }"`. */
    toast?: (scope: {
      toast: ToastItem<ToastContent>["toast"]
      item: ToastItem<ToastContent>
    }) => VNode[]
  }>,
  setup(props, { slots }) {
    const registry = props.overlays ?? sharedOverlays
    const entries = shallowRef(registry.entries())
    onScopeDispose(
      registry.subscribe(() => (entries.value = registry.entries()))
    )
    // Counted only on the client, once mounted.
    let release = () => {}
    onMounted(() => (release = registry.attachHost()))
    onBeforeUnmount(() => release())
    return () =>
      entries.value.map((entry) => {
        if (entry.type === "toaster") {
          return h(HostedToaster, {
            key: entry.id,
            toaster: (entry.data as { toaster: Toaster }).toaster,
            regionProps: props.toast,
            renderToast: slots.toast,
          })
        }
        if (entry.type === "confirm") {
          return h(HostedConfirm, {
            key: entry.id,
            entry: entry.data as ConfirmEntry,
          })
        }
        return null
      })
  },
})

export { createOverlays, overlays } from "@ui-sdk/core/overlays"
export type { OverlayEntry, Overlays } from "@ui-sdk/core/overlays"

export { OverlayHost, type OverlayHostToastProps }
