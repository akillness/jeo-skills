import type { Primitive } from "@ui-sdk/core"
import { portalTarget } from "@ui-sdk/core/renderer"
import {
  Teleport,
  defineComponent,
  h,
  inject,
  provide,
  shallowRef,
  type InjectionKey,
  type PropType,
  type SlotsType,
  type VNode,
} from "vue"
import { useKeptAway } from "./lifecycle"
import type { PrimitiveHandle, StateSlotFunctions } from "./use-primitive"

// Where a popup renders: an element or fragment, or nothing to render in place.
type PopupContainer = Element | DocumentFragment | null | undefined

const containerProp = Object as PropType<Element | DocumentFragment | null>

// The container the nearest popup above renders into. Popups inside it render
// there too, like a menu inside a portaled popover, unless they name their own.
const InheritedContainer: InjectionKey<() => PopupContainer> =
  Symbol("popup-container")

// A getter for a popup's container: its own, else the one the popup around it renders into.
function usePopupContainer(own: () => PopupContainer) {
  const inherited = inject(InheritedContainer, () => undefined)
  return () => own() ?? inherited()
}

// Provides the container to the popups inside one that renders into it.
const ContainerScope = defineComponent({
  name: "PopupContainerScope",
  props: { container: Object as PropType<Element | DocumentFragment> },
  setup(props, { slots }) {
    provide(InheritedContainer, () => props.container)
    return () => slots.default?.()
  },
})

// A Teleport into a popup's container that lets its content go with the page
// while a <KeepAlive> keeps the page away, as content rendered in place does.
// Left in the container, a cached modal would stay shown, focused and in the
// top layer over the page that replaced it.
const PopupTeleport = defineComponent({
  name: "PopupTeleport",
  props: {
    to: {
      type: Object as PropType<Element | DocumentFragment>,
      required: true,
    },
  },
  slots: Object as SlotsType<{ default: () => VNode[] }>,
  setup(props, { slots }) {
    const isAway = useKeptAway()
    // Vue types `to` as an element, though it renders into any parent node, like a shadow root.
    return () =>
      h(
        Teleport,
        { to: props.to as Element, disabled: isAway.value },
        slots.default()
      )
  },
})

// Renders a popup in place, in the top layer, or into its container. Without
// top layer support, it goes to the body. Popups inside inherit the container.
function renderPopup(element: VNode | VNode[], container: PopupContainer) {
  const target = portalTarget(container)
  const content = container
    ? [h(ContainerScope, { container }, () => element)]
    : ([] as VNode[]).concat(element)
  return target
    ? h(PopupTeleport, { to: target }, () => content)
    : content.length === 1
      ? content[0]
      : content
}

/**
 * Wraps a popup's content in the full-screen viewport a sheet sits in, while
 * its `viewport` slot is present: always for a drawer, and for a popup while
 * it presents as a sheet. The viewport is what goes into the top layer. Its
 * attributes are a subset of the content's, so the content's render keeps it current.
 */
function sheetViewport(
  popup: PrimitiveHandle<Primitive>,
  element: VNode | VNode[]
) {
  return popup.present("viewport")
    ? h("div", popup.slot("viewport", {}), ([] as VNode[]).concat(element))
    : element
}

const SheetHeaderKey: InjectionKey<{ value: HTMLElement | null }> =
  Symbol("sheet-header")

/**
 * Where an input renders while its popup presents as a sheet: in a header the
 * content renders at its top. The root calls `provideSheetHeader()`, the
 * content renders the header with `useSheetHeader()`, and the input renders
 * into it with `useInSheetHeader()`, so there's one input at a time.
 */
function provideSheetHeader() {
  provide(SheetHeaderKey, shallowRef<HTMLElement | null>(null))
}

/** Call in the content's `setup`. Returns the render step for the header, while the popup's `header` slot is present. */
function useSheetHeader(popup: PrimitiveHandle<Primitive>) {
  const header = inject(SheetHeaderKey, { value: null })
  const ref = (el: unknown) =>
    (header.value = (el as HTMLElement | null) ?? null)
  return () =>
    popup.present("header") ? h("div", popup.slot("header", {}, { ref })) : null
}

/** Call in the input's `setup`. Returns the render step that moves the input into the sheet's header while there is one. */
function useInSheetHeader() {
  const header = inject(SheetHeaderKey, { value: null })
  return (element: VNode | VNode[]) =>
    header.value
      ? h(Teleport, { to: header.value }, ([] as VNode[]).concat(element))
      : element
}

type Component = new (...args: any[]) => { $slots: object }

// The state a part's slots receive.
type SlotState<Part extends Component> = InstanceType<Part>["$slots"] extends {
  default?: (scope: { state: infer State }) => unknown
}
  ? State
  : never

// The part again, and as a generic component whose slots' state has a
// payload of type `Payload`. Exported so declarations name it instead of
// spelling out Vue's instance type.
type PayloadPart<Part extends Component> = Part &
  (new <Payload = unknown>(
    ...args: any[]
  ) => Omit<InstanceType<Part>, "$slots"> & {
    $slots: Readonly<
      StateSlotFunctions<SlotState<Part> & { payload: Payload | undefined }>
    >
  })

/**
 * Types a popup's content part by its payload: `const DayContent =
 * TooltipContent<Day>` is the same component, with a `Day` as its state's
 * payload. The payload's type is the app's; the part hands its state on as it is.
 */
const withPayload = <Part extends Component>(part: Part) =>
  part as PayloadPart<Part>

export {
  provideConnected,
  renderUnbound,
  useConnectedHandle,
  useConnectedPart,
  useControllerEntry,
  useControllerTarget,
} from "./controller-target"

export {
  containerProp,
  type PayloadPart,
  type PopupContainer,
  provideSheetHeader,
  renderPopup,
  sheetViewport,
  useInSheetHeader,
  usePopupContainer,
  useSheetHeader,
  withPayload,
}
