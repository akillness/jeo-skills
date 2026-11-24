import { isDisabled, watchFormDisabled } from "../../foundation/forms/form"
import { css } from "../../foundation/kernel/inline-style"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
  CommitDetails,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import { resizableApi, settings, type State } from "./resizable-api"
import {
  isCollapsed,
  sameSize,
  toCSS,
  type PanelSizes,
  type ResizableSize,
} from "./resizable-layout"
import type { ResizableStorage } from "./resizable-storage"
import { selects } from "../../foundation/kernel/selects"
import { live } from "../../foundation/kernel/live"

/**
 * Why a group's layout wants to change.
 * @stable
 */
type ResizableLayoutChangeReason =
  "drag" | "step-key" | "collapse" | "resize" | "imperative"

/**
 * What `onLayoutChange` receives after the layout.
 * @stable
 */
type ResizableLayoutChangeDetails = ChangeDetails<ResizableLayoutChangeReason>

/**
 * What `onLayoutCommit` receives after the layout.
 * @stable
 */
type ResizableLayoutCommitDetails = CommitDetails<ResizableLayoutChangeReason>

/**
 * Options for every write method on a controller.
 * @stable
 */
type ResizableChangeOptions = ChangeOptions<ResizableLayoutChangeReason>

/**
 * Resizes and inspects a group from outside it. Pass it as the `controller` option.
 * @stable
 */
function createResizableController() {
  return createController<{
    /** Each panel's size in percent, in order. */
    getLayout: () => number[]
    /** Sets every panel's size at once, in percent. It's fitted to the panels' bounds and adds up to 100. Returns whether anything changed. */
    setLayout: (layout: number[], options?: ResizableChangeOptions) => boolean
    /** Collapses a collapsible panel, by its id or its index. Returns whether it collapsed. */
    collapse: (
      panel: string | number,
      options?: ResizableChangeOptions
    ) => boolean
    /** Expands a collapsed panel to the size it had before it collapsed, or its minimum. Returns whether it expanded. */
    expand: (
      panel: string | number,
      options?: ResizableChangeOptions
    ) => boolean
    /** Resizes one panel, by its id or its index, like `resize("sidebar", "240px")`. Its neighbours give or take the difference. */
    resize: (
      panel: string | number,
      size: ResizableSize,
      options?: ResizableChangeOptions
    ) => boolean
    /** Whether a panel is collapsed. */
    isCollapsed: (panel: string | number) => boolean
  }>()
}

/**
 * A controller from `createResizableController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type ResizableController = ReturnType<typeof createResizableController>

/**
 * The options `resizable` takes. A component takes them as props on its root.
 * @stable
 */
type ResizableOptions = {
  /** Each panel's size in percent, in panel order, like `[25, 75]`. Pass it to control the group. */
  layout?: number[]
  /** The layout at first, when uncontrolled. Panels' own `defaultSize` is what a server renders, so prefer that with server rendering. */
  defaultLayout?: number[]
  /** Runs while the layout changes: on every frame of a drag and every key. `details.cancel()` keeps the layout. */
  onLayoutChange?: (
    layout: number[],
    details: ResizableLayoutChangeDetails
  ) => void
  /** Runs once an interaction that changed the layout ends: the pointer lifts, the key comes up, or a panel collapses. For saving. */
  onLayoutCommit?: (
    layout: number[],
    details: ResizableLayoutCommitDetails
  ) => void
  /**
   * The direction panels are laid out in. Horizontal panels sit side by side, vertical ones stack.
   * @defaultValue "horizontal"
   */
  orientation?: "horizontal" | "vertical"
  /** Stops every handle: no drags, no keys, and handles leave the tab order. */
  disabled?: boolean
  /**
   * How far an arrow key moves a handle, in percent.
   * @defaultValue 1
   */
  step?: number
  /**
   * How far Shift with an arrow key moves a handle, in percent.
   * @defaultValue 10
   */
  largeStep?: number
  /** Saves the layout when an interaction completes and restores it on the next visit, under this key. Give panels an `id` so it survives changes elsewhere on the page. */
  autoSaveId?: string
  /**
   * Where `autoSaveId` saves: anything with `getItem` and `setItem`, like a cookie store a server can read.
   * @defaultValue localStorage
   */
  storage?: ResizableStorage
  /** Resizes the group from anywhere. Create one with `createResizableController()`. */
  controller?: ResizableController
} & PrimitiveOptions

// Reads a `layout` or `default-layout` attribute: "25,75" is one percentage per panel.
const layoutAttribute = (attribute: string | null) =>
  attribute?.split(",").map(Number)

// Reads a panel's size attribute: "30" is 30 percent, like the number, and
// "240px" and "16rem" keep their unit.
function sizeAttribute(attribute: string | null) {
  if (attribute === null) {
    return undefined
  }
  return /^\s*-?[\d.]+\s*$/.test(attribute) ? Number(attribute) : attribute
}

/**
 * The props the `panel` slot of `resizable` takes.
 * @stable
 */
type ResizablePanelProps = {
  /** Identifies the panel for the controller, `aria-controls` and saved layouts. It's the element's id. Generated when left out. */
  id?: string
  /** Where the panel starts, in percent or with a unit, like `30` or `"240px"`. Without one, panels share what's left evenly. A server renders this size. */
  defaultSize?: ResizableSize
  /**
   * The smallest the panel gets while open.
   * @defaultValue 0
   */
  minSize?: ResizableSize
  /**
   * The largest the panel gets.
   * @defaultValue 100
   */
  maxSize?: ResizableSize
  /** Lets the panel collapse below its minimum to `collapsedSize`: by dragging past half the way there, with Enter or a double-click on its handle, or through the controller. */
  collapsible?: boolean
  /**
   * The size a collapsible panel collapses to. At 0, its content leaves the tab order and the accessibility tree.
   * @defaultValue 0
   */
  collapsedSize?: ResizableSize
}

/**
 * The props the `handle` slot of `resizable` takes.
 * @stable
 */
type ResizableHandleProps = {
  /** Stops this handle: no drags and no keys, and it leaves the tab order. */
  disabled?: boolean
}

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type ResizableState = {
  /** The direction panels are laid out in. */
  orientation: "horizontal" | "vertical"
  /** Whether the group is disabled. */
  disabled: boolean
  /** Whether a handle is being dragged. */
  dragging: boolean
  /** Each panel's size in percent. Reading it renders on every frame of a drag. */
  layout: number[]
}

/**
 * The state the `panel` slot of `resizable` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ResizablePanelState = {
  /** The direction panels are laid out in. */
  orientation: "horizontal" | "vertical"
  /** The panel's size in percent. Reading it renders on every frame of a drag. */
  size: number
  /** Whether the panel is down at its `collapsedSize`, below its minimum. */
  collapsed: boolean
  /** Whether the panel can collapse. */
  collapsible: boolean
}

/**
 * The state the `handle` slot of `resizable` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ResizableHandleState = {
  /** The direction panels are laid out in. The separator itself runs across it. */
  orientation: "horizontal" | "vertical"
  /** Whether the handle can't move. */
  disabled: boolean
  /** Whether the handle is being dragged. */
  dragging: boolean
  /** Whether the pointer is over the handle or within its hit area. */
  hovering: boolean
}

const orientationAttrs = (state: State) => ({
  "data-orientation": state.orientation,
})

function panelIndex(state: State, key: string) {
  const index = state.ids.indexOf(key)
  return index === -1 || index >= state.layout.length ? null : index
}

// Before the group lays panels out, which is on the server, a panel takes its
// `defaultSize` as its basis and one without grows into what's left. After,
// `--resizable-panel-size` holds its share. Shares add up to 100%, so the
// handles' size comes off every panel in proportion, and a panel's share of
// what panels have is exactly its size.
function panelStyle(props: PanelSizes) {
  const sized = props.defaultSize !== undefined
  const basis = sized ? toCSS(props.defaultSize!) : "0px"
  return css({
    flex: `${sized ? 0 : 1} 1 var(--resizable-panel-size, ${basis})`,
    "min-width": 0,
    "min-height": 0,
  })
}

const resizablePrimitive = /* @__PURE__ */ definePrimitive({
  name: "resizable",
  options: {
    layout: layoutAttribute,
    defaultLayout: layoutAttribute,
    onLayoutChange: "callback",
    onLayoutCommit: "callback",
    orientation: "string",
    disabled: "boolean",
    step: "number",
    largeStep: "number",
    autoSaveId: "string",
    storage: "value",
    controller: "value",
  },
  state: (options: ResizableOptions): State => ({
    ...settings(options),
    formDisabled: false,
    layout: [],
    controlledLayout: options.layout,
    ids: [],
    constraints: [],
    handles: {},
    hovering: null,
    dragging: null,
    sizes: {},
    handleValues: {},
  }),
  live: [
    "layout",
    "controlledLayout",
    "ids",
    "constraints",
    "handles",
    "hovering",
    "sizes",
    "handleValues",
  ],
  sync: (options) => ({
    ...settings(options),
    controlledLayout: options.layout,
  }),
  controlled: ["layout"],
  commits: ["layout"],
  api: resizableApi,
  slots: (slot) => ({
    root: slot<{}, ResizableState>({
      state: (state) => ({
        orientation: state.orientation,
        disabled: isDisabled(state),
        dragging: state.dragging !== null,
        layout: state.layout,
      }),
      attrs: (state) => ({
        ...orientationAttrs(state),
        "data-disabled": isDisabled(state) ? "" : undefined,
        "data-dragging": state.dragging !== null ? "" : undefined,
        style: css({
          display: "flex",
          "flex-direction": state.orientation === "vertical" ? "column" : "row",
        }),
      }),
      bind(el, { api, store }) {
        const cleanups = [
          watchFormDisabled(el, store),
          api.internal.bindRoot(el),
        ]
        return () => cleanups.forEach((cleanup) => cleanup?.())
      },
    }),

    panel: slot<ResizablePanelProps, ResizablePanelState>({
      props: {
        id: "id",
        defaultSize: sizeAttribute,
        minSize: sizeAttribute,
        maxSize: sizeAttribute,
        collapsible: "boolean",
        collapsedSize: sizeAttribute,
      },
      // A panel shows its own size, so a move reaches the panels it resizes.
      selects: selects({
        layout: [],
        controlledLayout: [],
        sizes: ({ key }) => [key],
        handleValues: [],
        hovering: [],
        dragging: [],
      }),
      state: (state, { key, props }) => {
        const index = panelIndex(state, key)
        const size = index === null ? 0 : state.sizes[key]
        const constraints =
          index === null ? undefined : state.constraints[index]
        return {
          orientation: state.orientation,
          size,
          collapsed: !!constraints && isCollapsed(constraints, size),
          collapsible: !!props.collapsible,
        }
      },
      attrs: (state, { key, props }) => ({
        id: key,
        ...orientationAttrs(state),
        style: panelStyle(props),
      }),
      live: live((state, { key }) => {
        const index = panelIndex(state, key)
        if (index === null) {
          return {}
        }
        const size = state.sizes[key]
        const constraints = state.constraints[index]
        const collapsed = !!constraints && isCollapsed(constraints, size)
        return {
          style: css({ "--resizable-panel-size": `${size}%` }),
          "data-collapsed": collapsed ? "" : undefined,
          // Nothing shows, so nothing in it should take focus or be read.
          inert: collapsed && sameSize(size, 0) ? "" : undefined,
        }
      }),
      bind: (_, part) => part.api.internal.bindPanel(part),
    }),

    // It runs across the group, so a horizontal group's separator is vertical.
    // A focusable separator needs aria-valuenow, so it joins the tab order only
    // once the group lays its panels out, never in the server's HTML.
    handle: slot<ResizableHandleProps, ResizableHandleState>({
      role: "separator",
      focus: "tab-stop",
      keys: (state) => [
        ...(state.orientation === "vertical"
          ? ["ArrowUp", "ArrowDown", "shift+ArrowUp", "shift+ArrowDown"]
          : ["ArrowLeft", "ArrowRight", "shift+ArrowLeft", "shift+ArrowRight"]),
        "Home",
        "End",
        "Enter",
      ],
      props: { disabled: "boolean", id: "id" },
      // A handle shows its own value, hover and drag, so a move reaches the
      // handles whose value it changes.
      selects: selects({
        layout: [],
        controlledLayout: [],
        sizes: [],
        handleValues: ({ key }) => [key],
        hovering: ({ key }) => [key],
        dragging: ({ key }) => [key],
      }),
      state: (state, { key, props }) => ({
        orientation: state.orientation,
        disabled: isDisabled(state) || !!props.disabled,
        dragging: state.dragging === key,
        hovering: state.hovering === key,
      }),
      attrs: (state, { key, props }) => {
        const disabled = isDisabled(state) || !!props.disabled
        return {
          "aria-disabled": disabled ? "true" : undefined,
          "aria-orientation":
            state.orientation === "horizontal" ? "vertical" : "horizontal",
          ...orientationAttrs(state),
          "data-disabled": disabled ? "" : undefined,
          "data-dragging": state.dragging === key ? "" : undefined,
          style: css({
            flex: "none",
            "touch-action": "none",
            "user-select": "none",
          }),
        }
      },
      live: live((state, { key }) => {
        const value = state.handleValues[key]
        const focusable = !!value && !value.disabled && !isDisabled(state)
        return {
          tabindex: focusable ? "0" : undefined,
          "aria-controls": value?.panel,
          "aria-valuenow": value ? String(Math.round(value.now)) : undefined,
          "aria-valuemin": value ? String(Math.round(value.min)) : undefined,
          "aria-valuemax": value ? String(Math.round(value.max)) : undefined,
          "data-hovering": state.hovering === key ? "" : undefined,
        }
      }),
      on: {
        keydown: (event, { api, el, key }) =>
          el && api.internal.keydown(event, key, el),
        keyup: (event, { api }) => api.internal.commitKeys(event),
        focusout: (_, { api }) => api.internal.commitKeys(),
        dblclick: (event, { api, key }) => api.internal.toggle(key, event),
      },
      bind: (el, part) => part.api.internal.bindHandle(el, part),
    }),
  }),
  agent: { actions: ["setLayout", "collapse", "expand"] },
})

/**
 * The type of `resizable`.
 * @stable
 */
interface ResizablePrimitive extends Named<typeof resizablePrimitive> {}

/**
 * The resizable primitive, with the slots `root`, `panel`, `handle`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const resizable: ResizablePrimitive = resizablePrimitive

export {
  createResizableController,
  resizable,
  type ResizableChangeOptions,
  type ResizableController,
  type ResizableHandleProps,
  type ResizableHandleState,
  type ResizableLayoutChangeDetails,
  type ResizableLayoutChangeReason,
  type ResizableLayoutCommitDetails,
  type ResizableOptions,
  type ResizablePanelProps,
  type ResizablePanelState,
  type ResizablePrimitive,
  type ResizableState,
}
export type { ResizableApi } from "./resizable-api"
export type { ResizableSize } from "./resizable-layout"
export type { ResizableStorage } from "./resizable-storage"
export { storageKey as resizableStorageKey } from "./resizable-storage"
