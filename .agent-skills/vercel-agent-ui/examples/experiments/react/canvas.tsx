import * as React from "react"
import {
  createChange,
  createConnect,
  createLasso,
  createMove,
  createRovingFocus,
  createSelection,
  createViewport,
  css,
  definePrimitive,
  live,
  selects,
  spatialMove,
  type ChangeDetails,
  type ConnectDraft,
  type ConnectReason,
  type LassoDraft,
  type MoveDraft,
  type MovePoint,
  type MoveReason,
  type Viewport,
} from "@ui-sdk/core"
import { edgePath } from "../edge-path"
import { createParts, usePart, type PartProps } from "@ui-sdk/react/primitive"
import { MaximizeIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react"

type CanvasEdgeData = { id: string; from: string; to: string }

type CanvasNodeData = {
  id: string
  label: string
  inputs: boolean
  outputs: boolean
}

type CanvasEdgesChangeReason = ConnectReason | "delete-key" | "imperative"

type CanvasOptions = {
  nodes: CanvasNodeData[]
  positions?: Record<string, MovePoint>
  defaultPositions?: Record<string, MovePoint>
  onPositionsChange?: (
    positions: Record<string, MovePoint>,
    details: ChangeDetails<MoveReason | "imperative">
  ) => void
  edges?: CanvasEdgeData[]
  defaultEdges?: CanvasEdgeData[]
  onEdgesChange?: (
    edges: CanvasEdgeData[],
    details: ChangeDetails<CanvasEdgesChangeReason>
  ) => void
  selected?: string[]
  defaultSelected?: string[]
  onSelectedChange?: (selected: string[], details: ChangeDetails) => void
  nodeSize?: { width: number; height: number }
}

type CanvasState = {
  positions: Record<string, MovePoint>
  edges: CanvasEdgeData[]
  selected: string[]
  focused: string | null
  moving: MoveDraft | null
  lasso: LassoDraft | null
  viewport: Viewport
  connecting: ConnectDraft | null
}

type CanvasRootState = { edges: CanvasEdgeData[] }
type CanvasNodeState = { selected: boolean }

const defaultSize = { width: 140, height: 48 }
const nodeOf = (port: string) => port.split(":")[0]
const sideOf = (port: string) => (port.endsWith(":out") ? "right" : "left")

function portPoint(
  state: CanvasState,
  port: string,
  size: { width: number; height: number }
) {
  const node = nodeOf(port)
  const at = state.positions[node] ?? { x: 0, y: 0 }
  const drag = state.moving?.keys.includes(node) ? state.moving : null
  return {
    x: at.x + (drag?.dx ?? 0) + (sideOf(port) === "right" ? size.width : 0),
    y: at.y + (drag?.dy ?? 0) + size.height / 2,
    side: sideOf(port) as "left" | "right",
  }
}

const canvas = /* @__PURE__ */ definePrimitive({
  name: "canvas",
  options: {
    nodes: "value",
    positions: "value",
    defaultPositions: "value",
    onPositionsChange: "callback",
    edges: "value",
    defaultEdges: "value",
    onEdgesChange: "callback",
    selected: "list",
    defaultSelected: "list",
    onSelectedChange: "callback",
    nodeSize: "value",
  },
  state: (options: CanvasOptions): CanvasState => ({
    positions: options.positions ?? options.defaultPositions ?? {},
    edges: options.edges ?? options.defaultEdges ?? [],
    selected: options.selected ?? options.defaultSelected ?? [],
    focused: null,
    moving: null,
    lasso: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    connecting: null,
  }),
  sync: (options) => ({
    ...(options.positions === undefined
      ? {}
      : { positions: options.positions }),
    ...(options.edges === undefined ? {} : { edges: options.edges }),
    ...(options.selected === undefined ? {} : { selected: options.selected }),
  }),
  controlled: ["positions", "edges", "selected"],
  live: ["moving", "lasso", "viewport", "connecting"],
  api: (context) => {
    const { store, options } = context
    const change = createChange(context)
    const node = (key: string) => options().nodes.find((n) => n.id === key)
    const size = () => options().nodeSize ?? defaultSize
    const viewport = createViewport<CanvasState>(context, {
      key: "viewport",
      surface: () => context.element("root"),
    })
    const roving = createRovingFocus<CanvasState, { value: string }>(context, {
      slot: "node",
      key: "focused",
      move: spatialMove(),
    })
    const selection = createSelection(context, {
      key: "selected",
      set: (value, details) => change("selected", value, details),
      order: () => roving.items().map((item) => item.key),
      multiple: () => true,
    })
    const move = createMove<CanvasState>(context, {
      key: "positions",
      draft: "moving",
      set: (value, details) => change("positions", value, details),
      group: (key) =>
        store.get().selected.includes(key) ? store.get().selected : [key],
      step: () => 8,
      scale: () => viewport.get().zoom,
      label: (key) => node(key)?.label,
    })
    const lasso = createLasso<CanvasState>(context, {
      slot: "node",
      draft: "lasso",
      selected: () => store.get().selected,
      set: (keys, details) => change("selected", keys, details),
    })
    const addEdge = (from: string, to: string) =>
      !connected(from, to) &&
      change(
        "edges",
        [...store.get().edges, { id: `${from}->${to}`, from, to }],
        { reason: "imperative" }
      )
    const removeEdge = (id: string) =>
      change(
        "edges",
        store.get().edges.filter((e) => e.id !== id),
        { reason: "imperative" }
      )
    const connected = (a: string, b: string) =>
      store
        .get()
        .edges.find(
          (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a)
        )
    const connect = createConnect<CanvasState>(context, {
      slot: "port",
      draft: "connecting",
      canConnect: (from, to) =>
        nodeOf(from) !== nodeOf(to) && sideOf(from) !== sideOf(to),
      point: viewport.toCanvas,
      label: (port) =>
        `${node(nodeOf(port))?.label} ${sideOf(port) === "right" ? "output" : "input"}`,
      connect: (a, b, details) => {
        const [from, to] = sideOf(a) === "right" ? [a, b] : [b, a]
        const existing = connected(from, to)
        if (existing) {
          return details.reason === "connect-key" && removeEdge(existing.id)
        }
        return addEdge(from, to)
      },
    })

    const api = {
      roving,
      move,
      lasso,
      viewport,
      connect,
      size,
      portPoint: (state: CanvasState, port: string) =>
        portPoint(state, port, size()),
      addEdge,
      removeEdge,
      setPositions(positions: Record<string, MovePoint>) {
        return change(
          "positions",
          { ...store.get().positions, ...positions },
          { reason: "imperative" }
        )
      },
      select(keys: string[]) {
        return change("selected", keys, { reason: "imperative" })
      },
      setViewport(value: Viewport) {
        return viewport.setViewport(value)
      },
      showAll() {
        const points = Object.values(store.get().positions)
        if (!points.length) {
          return false
        }
        const { width, height } = size()
        return viewport.fit({
          left: Math.min(...points.map((p) => p.x)),
          top: Math.min(...points.map((p) => p.y)),
          right: Math.max(...points.map((p) => p.x + width)),
          bottom: Math.max(...points.map((p) => p.y + height)),
        })
      },
      nodeKeydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if (connect.keydown(event) || move.keydown(event, key)) {
          return
        }
        const at = el.getBoundingClientRect()
        if (
          viewport.keydown(event, {
            x: at.left + at.width / 2,
            y: at.top + at.height / 2,
          })
        ) {
          return
        }
        if (event.key === "1") {
          api.showAll()
        } else if (event.key === "c") {
          const data = node(key)
          if (data) {
            connect.start(data.outputs ? `${key}:out` : `${key}:in`)
          }
        } else if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault()
          change(
            "edges",
            store
              .get()
              .edges.filter(
                (e) => nodeOf(e.from) !== key && nodeOf(e.to) !== key
              ),
            { reason: "delete-key", event }
          )
        } else if (event.key === " ") {
          event.preventDefault()
          selection.toggle(key, { reason: "item-press", event })
        } else if (event.key === "Escape" && store.get().selected.length) {
          change("selected", [], { reason: "escape-key", event })
        } else {
          roving.keydown(event, el)
        }
      },
      nodePointerdown(event: PointerEvent, el: HTMLElement, key: string) {
        if (event.button !== 0) {
          return
        }
        event.stopPropagation()
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
          selection.toggle(key, { reason: "item-press", event })
        } else if (!store.get().selected.includes(key)) {
          selection.choose(key, { reason: "item-press", event })
        }
        move.pointerdown(event, key, el)
      },
      rootPointerdown(event: PointerEvent, el: HTMLElement) {
        const target = event.target as HTMLElement
        if (target !== el && !target.hasAttribute("data-canvas-empty")) {
          return
        }
        if (event.shiftKey) {
          return lasso.pointerdown(event, el)
        }
        if (store.get().selected.length) {
          change("selected", [], { reason: "item-press", event })
        }
        viewport.pointerdown(event)
      },
    }
    return api
  },
  slots: (slot) => ({
    root: slot<{}, CanvasRootState>({
      state: (state) => ({ edges: state.edges }),
      attrs: () => ({
        style: css({
          position: "relative",
          overflow: "hidden",
          "touch-action": "none",
          "user-select": "none",
        }),
      }),
      live: live<CanvasState, any, {}>((state) => ({
        "data-connecting": state.connecting ? "" : undefined,
        style: css({ "--canvas-zoom": state.viewport.zoom }),
      })),
      on: {
        wheel: (event, { api }) => api.viewport.wheel(event),
        pointerdown: (event, { el, api }) =>
          el && api.rootPointerdown(event, el),
      },
      bind: (_el, { api }) => {
        const frame = requestAnimationFrame(() => api.showAll())
        return () => cancelAnimationFrame(frame)
      },
    }),
    world: slot({
      attrs: (_state, { id }) => ({
        role: "listbox",
        "aria-label": "Nodes",
        "aria-multiselectable": "true",
        "aria-roledescription": "canvas",
        "aria-describedby": `${id}-instructions`,
        "data-canvas-empty": "",
        style: css({
          position: "absolute",
          left: 0,
          top: 0,
          width: "1px",
          height: "1px",
        }),
      }),
      live: live<CanvasState, any, {}>((state, { api }) => ({
        style: api.viewport.style(state),
      })),
    }),
    node: slot<{ value: string }, CanvasNodeState>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      state: (state, { key }) => ({ selected: state.selected.includes(key) }),
      attrs: (state, part) => {
        const at = state.positions[part.key] ?? { x: 0, y: 0 }
        const links = state.edges
          .filter(
            (e) => nodeOf(e.from) === part.key || nodeOf(e.to) === part.key
          )
          .map((e) =>
            nodeOf(e.from) === part.key
              ? `to ${nodeOf(e.to)}`
              : `from ${nodeOf(e.from)}`
          )
        return {
          role: "option",
          "aria-roledescription": "node",
          "aria-selected": String(state.selected.includes(part.key)),
          "aria-description": links.length
            ? `Connected ${links.join(", ")}.`
            : "Not connected.",
          tabindex: part.api.roving.tabIndex(state, part),
          "data-selected": state.selected.includes(part.key) ? "" : undefined,
          style: css({
            position: "absolute",
            left: `${at.x}px`,
            top: `${at.y}px`,
            width: `${part.api.size().width}px`,
            height: `${part.api.size().height}px`,
          }),
        }
      },
      live: live<CanvasState, any, { value: string }>(
        (state, { key, api }) => ({
          "data-dragging": api.move.dragging(state, key) ? "" : undefined,
          "data-lassoed": api.lasso.touches(state, key) ? "" : undefined,
          style: api.move.style(state, key),
        })
      ),
      on: {
        keydown: (event, { el, api, key }) =>
          el && api.nodeKeydown(event, el, key),
        pointerdown: (event, { el, api, key }) =>
          el && api.nodePointerdown(event, el, key),
        focus: (_event, { api, store, key }) => {
          const at = store.get().positions[key]
          if (at) {
            api.viewport.reveal({
              left: at.x,
              top: at.y,
              right: at.x + api.size().width,
              bottom: at.y + api.size().height,
            })
          }
        },
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
    port: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (_state, { key }) => ({
        "aria-hidden": "true",
        "data-side": sideOf(key),
      }),
      live: live<CanvasState, any, { value: string }>(
        (state, { api, key }) => ({
          "data-connect": api.connect.role(state, key),
        })
      ),
      on: {
        pointerdown: (event, { el, api, key }) =>
          el && api.connect.pointerdown(event, key, el),
      },
    }),
    edge: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ fill: "none" }),
      live: live<CanvasState, any, { value: string }>((state, { key, api }) => {
        const edge = state.edges.find((e) => e.id === key)
        return edge
          ? {
              d: edgePath(
                api.portPoint(state, edge.from),
                api.portPoint(state, edge.to)
              ).d,
            }
          : {}
      }),
    }),
    unlink: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { key }) => {
        const edge = state.edges.find((e) => e.id === key)
        return {
          type: "button",
          tabindex: "-1",
          "aria-label": edge
            ? `Disconnect ${nodeOf(edge.from)} from ${nodeOf(edge.to)}`
            : undefined,
          style: css({ position: "absolute", translate: "-50% -50%" }),
        }
      },
      live: live<CanvasState, any, { value: string }>((state, { key, api }) => {
        const edge = state.edges.find((e) => e.id === key)
        if (!edge) {
          return {}
        }
        const { mid } = edgePath(
          api.portPoint(state, edge.from),
          api.portPoint(state, edge.to)
        )
        return { style: css({ left: `${mid.x}px`, top: `${mid.y}px` }) }
      }),
      on: { pointerdown: (event) => event.stopPropagation() },
      press: ({ api, key }) => api.removeEdge(key),
    }),
    wire: slot({
      attrs: () => ({ fill: "none", "aria-hidden": "true" }),
      live: live<CanvasState, any, {}>((state, { api }) => {
        const draft = state.connecting
        if (!draft) {
          return { d: "" }
        }
        const from = api.portPoint(state, draft.from)
        const to = {
          x: draft.x,
          y: draft.y,
          side: from.side === "right" ? ("left" as const) : ("right" as const),
        }
        return {
          d: edgePath(from, to).d,
          "data-snapped": draft.to ? "" : undefined,
        }
      }),
    }),
    lasso: slot({
      attrs: () => ({ "aria-hidden": "true" }),
      live: live<CanvasState, any, {}>((state, { api }) => ({
        style: api.lasso.style(state),
      })),
    }),
    "zoom-in": slot({
      attrs: () => ({ type: "button", "aria-label": "Zoom in" }),
      press: ({ api }) => api.viewport.zoomBy(1.25),
    }),
    "zoom-out": slot({
      attrs: () => ({ type: "button", "aria-label": "Zoom out" }),
      press: ({ api }) => api.viewport.zoomBy(0.8),
    }),
    fit: slot({
      attrs: () => ({ type: "button", "aria-label": "Fit all nodes" }),
      press: ({ api }) => api.showAll(),
    }),
    zoom: slot({
      attrs: () => ({ "aria-hidden": "true" }),
      bind: (el, { store }) => {
        const write = () =>
          (el.textContent = `${Math.round(store.get().viewport.zoom * 100)}%`)
        write()
        return store.subscribe(write)
      },
    }),
    instructions: slot({
      attrs: (_state, { id }) => ({ id: `${id}-instructions`, hidden: "" }),
    }),
  }),
})

const parts = createParts(canvas, {
  root: "div",
  world: "div",
  edge: "path",
  unlink: "button",
  wire: "path",
  lasso: "div",
  "zoom-in": "button",
  "zoom-out": "button",
  fit: "button",
  zoom: "span",
  instructions: "div",
})

const CanvasNodeContext = React.createContext<string | null>(null)

const Canvas = parts.Root

const CanvasWorld = parts.World

function CanvasNode({
  value,
  ...props
}: { value: string } & PartProps<"div", CanvasNodeState>) {
  return (
    <CanvasNodeContext.Provider value={value}>
      {usePart(canvas, "node", { value }, props)}
    </CanvasNodeContext.Provider>
  )
}

function CanvasPort({
  side,
  ...props
}: { side: "in" | "out" } & PartProps<"span">) {
  const node = React.useContext(CanvasNodeContext)
  if (!node) {
    throw new Error("CanvasPort must be used inside <CanvasNode>.")
  }
  return usePart(canvas, "port", { value: `${node}:${side}` }, props, "span")
}

const CanvasEdge = parts.Edge

const CanvasUnlink = parts.Unlink

const CanvasWire = parts.Wire

const CanvasLasso = parts.Lasso

const CanvasZoomIn = parts.ZoomIn

const CanvasZoomOut = parts.ZoomOut

const CanvasFit = parts.Fit

const CanvasZoom = parts.Zoom

const CanvasInstructions = parts.Instructions

const nodes: CanvasNodeData[] = [
  { id: "prompt", label: "User prompt", inputs: false, outputs: true },
  { id: "search", label: "Search docs", inputs: true, outputs: true },
  { id: "draft", label: "Draft answer", inputs: true, outputs: true },
  { id: "check", label: "Check facts", inputs: true, outputs: true },
  { id: "reply", label: "Reply", inputs: true, outputs: false },
]
const positions = {
  prompt: { x: 0, y: 112 },
  search: { x: 176, y: 24 },
  draft: { x: 352, y: 112 },
  check: { x: 528, y: 24 },
  reply: { x: 528, y: 200 },
}
const edges = [
  { id: "prompt:out->search:in", from: "prompt:out", to: "search:in" },
  { id: "search:out->draft:in", from: "search:out", to: "draft:in" },
  { id: "prompt:out->draft:in", from: "prompt:out", to: "draft:in" },
  { id: "draft:out->check:in", from: "draft:out", to: "check:in" },
]

function Example() {
  return (
    <Canvas nodes={nodes} defaultPositions={positions} defaultEdges={edges}>
      {({ edges }) => (
        <>
          <CanvasWorld>
            <svg data-slot="canvas-edges" width="1" height="1">
              {edges.map((edge) => (
                <CanvasEdge key={edge.id} value={edge.id} strokeWidth={2} />
              ))}
              <CanvasWire strokeWidth={2} strokeDasharray="6 4" />
            </svg>
            {edges.map((edge) => (
              <CanvasUnlink key={edge.id} value={edge.id}>
                <XIcon />
              </CanvasUnlink>
            ))}
            {nodes.map((node) => (
              <CanvasNode key={node.id} value={node.id}>
                {node.label}
                {node.inputs && <CanvasPort side="in" />}
                {node.outputs && <CanvasPort side="out" />}
              </CanvasNode>
            ))}
          </CanvasWorld>
          <CanvasLasso />
          <div data-slot="canvas-controls">
            <CanvasZoomOut>
              <MinusIcon />
            </CanvasZoomOut>
            <CanvasZoom />
            <CanvasZoomIn>
              <PlusIcon />
            </CanvasZoomIn>
            <CanvasFit>
              <MaximizeIcon />
            </CanvasFit>
          </div>
          <CanvasInstructions>
            Arrow keys move to the nearest node. Alt with an arrow moves the
            selection. C connects from the focused node: arrows choose a port,
            Enter connects, and connecting a pair again disconnects it. Delete
            disconnects the node. Plus and minus zoom, 0 resets, 1 fits all.
          </CanvasInstructions>
        </>
      )}
    </Canvas>
  )
}

export {
  canvas,
  Canvas,
  type CanvasEdgeData,
  CanvasEdge,
  type CanvasEdgesChangeReason,
  CanvasFit,
  CanvasInstructions,
  CanvasLasso,
  CanvasNode,
  type CanvasNodeData,
  type CanvasNodeState,
  type CanvasOptions,
  CanvasPort,
  type CanvasRootState,
  CanvasUnlink,
  CanvasWire,
  CanvasWorld,
  CanvasZoom,
  CanvasZoomIn,
  CanvasZoomOut,
  Example,
}
