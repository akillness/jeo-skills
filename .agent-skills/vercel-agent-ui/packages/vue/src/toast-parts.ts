import {
  createToaster as createCoreToaster,
  toast as coreToast,
  toastRegion,
  type Toast as ToastData,
  type ToastCloseProps,
  type ToastItem,
  type Toaster,
} from "@ui-sdk/core/toast"
import type { ToastRegionInternalOptions } from "@ui-sdk/core/renderer"
import {
  defineComponent,
  h,
  inject,
  onBeforeUpdate,
  provide,
  shallowRef,
  useId,
  type InjectionKey,
  type PropType,
  type SlotsType,
  type VNode,
} from "vue"
import { slotContent } from "./children"
import { withElement } from "./create-parts"
import { containerProp, renderPopup } from "./popup"
import {
  optionalBoolean,
  usePart,
  usePrimitive,
  type PrimitiveHandle,
  type PartSlots,
} from "./use-primitive"

/**
 * What toasts can say in Vue: text, or a VNode.
 * @stable
 */
type ToastContent = string | VNode

type RegionHandle = PrimitiveHandle<typeof toastRegion>

// What the action and close buttons run when pressed.
type ButtonAction = NonNullable<ToastCloseProps["action"]>

// The region and the toast a part belongs to: the toast's data, beside its id.
const ToastKey: InjectionKey<{
  region: RegionHandle
  toast: () => ToastData<ToastContent>
}> = Symbol("toast")

function useToast(part: string) {
  const context = inject(ToastKey, null)
  if (!context) {
    throw new Error(`${part} must be used inside <Toast>, in a <ToastRegion>.`)
  }
  return context
}

// Provides one toast to the parts inside it.
const ToastScope = defineComponent({
  name: "ToastScope",
  props: {
    region: { type: Object as PropType<RegionHandle>, required: true },
    toast: {
      type: Object as PropType<ToastData<ToastContent>>,
      required: true,
    },
  },
  setup(props, { slots }) {
    provide(ToastKey, { region: props.region, toast: () => props.toast })
    return () => slots.default?.()
  },
})

const regionProps = {
  toaster: Function as unknown as PropType<Toaster<any>>,
  side: String as PropType<"top" | "bottom">,
  align: String as PropType<"start" | "center" | "end">,
  maxVisible: Number,
  expanded: optionalBoolean,
  // `null` turns the shortcut off.
  shortcut: { type: String as PropType<string | null>, default: undefined },
  pendingAnnouncement: String,
  debug: optionalBoolean,
  container: containerProp,
}

function createRegion(placed: boolean) {
  return withElement(
    "section",
    defineComponent({
      name: placed ? "ToastRegion" : "HostedToastRegion",
      inheritAttrs: false,
      props: regionProps,
      slots: Object as SlotsType<{
        /** Renders each toast: `#default="{ toast }"`. */
        default?: (scope: {
          toast: ToastItem<ToastContent>["toast"]
          item: ToastItem<ToastContent>
        }) => VNode[]
      }>,
      setup(props, { slots, attrs }) {
        // `attrs` aren't reactive, so the name the region announces follows
        // them through a ref, updated before each render a new name causes.
        const label = shallowRef(attrs["aria-label"] as string | undefined)
        onBeforeUpdate(
          () => (label.value = attrs["aria-label"] as string | undefined)
        )
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
              placed,
              label: label.value,
            }) satisfies ToastRegionInternalOptions
        )
        // The list of toasts, built as the region renders, so it reads the toasts.
        let list: VNode | undefined
        const part = usePart(
          region,
          "region",
          undefined,
          () => {
            const { "aria-label": _, ...rest } = attrs
            return rest
          },
          { tag: "section", children: () => list }
        )
        return () => {
          const toasts = part.state.toasts as readonly ToastItem<ToastContent>[]
          list = h(
            "ol",
            region.slot("list"),
            toasts.map((item) =>
              h(
                ToastScope,
                { key: item.toast.id, region, toast: item.toast },
                () =>
                  slots.default
                    ? slots.default({ toast: item.toast, item })
                    : h(DataToast, { toast: item.toast })
              )
            )
          )
          const element = part()
          return element && renderPopup(element, props.container)
        }
      },
    })
  )
}

/**
 * Shows a toaster's toasts. Place it once, or let `<OverlayHost />` render it.
 * @stable
 */
const ToastRegion = createRegion(true)

// The region the overlay host renders.
const HostedToastRegion = createRegion(false)

// A toast rendered from its data, with the parts.
const DataToast = defineComponent({
  name: "DataToast",
  props: {
    toast: {
      type: Object as PropType<ToastData<ToastContent>>,
      required: true,
    },
  },
  setup(props) {
    return () => {
      const { toast } = props
      return h(Toast, null, () => [
        h("div", [
          toast.title != null ? h(ToastTitle) : null,
          toast.description != null ? h(ToastDescription) : null,
        ]),
        toast.action ? h(ToastAction) : null,
        toast.cancel
          ? h(
              ToastClose,
              { action: toast.cancel.onCancel },
              () => toast.cancel!.label
            )
          : null,
      ])
    }
  },
})

/**
 * One toast. Swipe it toward the region's side, or press Escape on it, to dismiss it.
 * @stable
 */
const Toast = withElement(
  "li",
  defineComponent({
    name: "Toast",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof toastRegion, "root">,
    setup() {
      const { region, toast } = useToast("Toast")
      return usePart(
        region,
        "root",
        () => ({ id: toast().id }),
        undefined,
        "li"
      )
    },
  })
)

// Title and description render the toast's own content when they have none.
function contentPart(name: string, slot: "title" | "description") {
  return withElement(
    "div",
    defineComponent({
      name,
      inheritAttrs: false,
      slots: Object as PartSlots<typeof toastRegion, typeof slot>,
      setup(_, { slots }) {
        const { region, toast } = useToast(name)
        let content: unknown
        const part = usePart(
          region,
          slot,
          () => ({ id: toast().id }),
          undefined,
          {
            tag: "div",
            children: () => content,
          }
        )
        return () => {
          content =
            slotContent(slots.default, { state: part.state }) ?? toast()[slot]
          return content == null ? null : part()
        }
      },
    })
  )
}

/**
 * The toast's title. Renders the toast's `title` without content of its own, and nothing when it has neither.
 * @stable
 */
const ToastTitle = contentPart("ToastTitle", "title")

/**
 * The toast's description. Renders the toast's `description` without content of its own, and nothing when it has neither.
 * @stable
 */
const ToastDescription = contentPart("ToastDescription", "description")

/**
 * The toast's action, like Undo. Renders the toast's `action` label without
 * content of its own, as a link when the action has an `href`. A Promise from
 * its handler keeps the toast open and the button pending.
 * @stable
 */
const ToastAction = withElement(
  "button",
  defineComponent({
    name: "ToastAction",
    inheritAttrs: false,
    props: {
      // Runs instead of the toast's own `action.onAction`. `@action="undo"` binds here.
      onAction: Function as PropType<ButtonAction>,
      // Whether pressing it dismisses the toast. Defaults to the toast's `action.dismiss`, else true.
      dismiss: optionalBoolean,
    },
    slots: Object as PartSlots<typeof toastRegion, "action">,
    setup(props, { slots, attrs }) {
      const { region, toast } = useToast("ToastAction")
      const id = useId()
      const part = () => ({
        id,
        toast: toast().id,
        onAction: props.onAction,
        dismiss: props.dismiss,
      })
      // A link when the action has an `href`.
      const element = () => {
        const href = toast().action?.href
        return href ? { href, ...attrs } : { type: "button", ...attrs }
      }
      const render = usePart(region, "action", part, element, {
        get tag() {
          return toast().action?.href ? "a" : "button"
        },
        children: (state) =>
          slotContent(slots.default, { state }) ?? toast().action?.label,
      })
      return () => (!toast().action && !props.onAction ? null : render())
    },
  })
)

/**
 * Closes the toast. With an `action`, runs it first, and a returned Promise keeps the toast open until it settles.
 * @stable
 */
const ToastClose = withElement(
  "button",
  defineComponent({
    name: "ToastClose",
    inheritAttrs: false,
    props: {
      // Runs before the toast closes. A returned Promise keeps it open and pending until it settles.
      action: Function as PropType<ButtonAction>,
      // `@action="save"` binds here, so the part gets the handler's Promise.
      onAction: Function as PropType<ButtonAction>,
    },
    slots: Object as PartSlots<typeof toastRegion, "close">,
    setup(props, { attrs }) {
      const { region, toast } = useToast("ToastClose")
      const id = useId()
      const part = () => ({
        id,
        toast: toast().id,
        action: props.action ?? props.onAction,
      })
      return usePart(
        region,
        "close",
        part,
        () => ({ type: "button", ...attrs }),
        "button"
      )
    },
  })
)

/**
 * Shows a toast from anywhere: `toast("Saved")`, `toast.success(...)`,
 * `toast.promise(save(), { loading, success, error })`. Content is text or a VNode.
 * @stable
 */
const toast = coreToast as Toaster<ToastContent>

/**
 * Creates a queue of toasts and the function that adds to it, for a second
 * region with its own toasts. Pass it to that region as `toaster`.
 * @stable
 */
const createToaster = createCoreToaster as <Content = ToastContent>(
  options?: Parameters<typeof createCoreToaster>[0]
) => Toaster<Content>

export {
  createToaster,
  HostedToastRegion,
  toast,
  Toast,
  ToastAction,
  ToastClose,
  type ToastContent,
  ToastDescription,
  ToastRegion,
  ToastTitle,
}
