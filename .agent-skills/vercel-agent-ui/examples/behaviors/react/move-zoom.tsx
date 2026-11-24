import * as React from "react"
import {
  createChange,
  createMove,
  css,
  definePrimitive,
  live,
  type MoveDraft,
  type MovePoint,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type CanvasState = {
  positions: Record<string, MovePoint>
  zoom: number
  moving: MoveDraft | null
}

type CanvasOptions = {
  zoom?: number
  onPositionsChange?: (positions: Record<string, MovePoint>) => void
}

const canvas = definePrimitive({
  name: "canvas",
  options: { zoom: "number", onPositionsChange: "callback" },
  state: (options: CanvasOptions): CanvasState => ({
    positions: { circle: { x: 40, y: 40 }, square: { x: 168, y: 88 } },
    zoom: options.zoom ?? 1,
    moving: null,
  }),
  sync: (options) => ({ zoom: options.zoom ?? 1 }),
  live: ["moving"],
  api: (context) => {
    const change = createChange(context)
    const move = createMove<CanvasState>(context, {
      key: "positions",
      draft: "moving",
      set: (value, details) => change("positions", value, details),
      scale: () => context.store.get().zoom,
      bounds: () => ({ minX: 0, minY: 0, maxX: 224, maxY: 128 }),
    })
    return {
      move,
      act(action: string) {
        if (action === "center") {
          move.moveTo("circle", { x: 112, y: 64 })
        } else if (action === "nudge") {
          move.moveBy(["circle"], 10, 0)
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "group" }) }),
    surface: slot({
      attrs: (state) => ({
        style: css({
          position: "relative",
          width: "272px",
          height: "176px",
          transform: `scale(${state.zoom})`,
          "transform-origin": "0 0",
        }),
      }),
    }),
    shape: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { key }) => {
        const at = state.positions[key]
        return {
          tabindex: "0",
          style: css({
            position: "absolute",
            left: `${at.x}px`,
            top: `${at.y}px`,
            "touch-action": "none",
          }),
        }
      },
      live: live<CanvasState, any, { value: string }>(
        (state, { api, key }) => ({
          style: api.move.style(state, key),
        })
      ),
      on: {
        keydown: (event, { api, key }) => api.move.keydown(event, key),
        pointerdown: (event, { el, api, key }) =>
          api.move.pointerdown(event, key, el!),
      },
    }),
    action: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }) => api.act(key),
    }),
  }),
})

const parts = createParts(canvas, {
  root: "div",
  surface: "div",
  shape: "div",
  action: "button",
})

const Canvas = parts.Root

const CanvasSurface = parts.Surface

const CanvasShape = parts.Shape

const CanvasAction = parts.Action

function Example() {
  const log = useLog()
  const [zoom, setZoom] = React.useState(1)
  return (
    <Canvas
      aria-label="Canvas"
      zoom={zoom}
      onPositionsChange={({ circle, square }) =>
        log(
          `Circle at ${circle.x}, ${circle.y} · Square at ${square.x}, ${square.y}`
        )
      }
    >
      <div data-slot="controls">
        {[0.5, 1, 1.5].map((option) => (
          <button
            key={option}
            type="button"
            data-variant="ghost"
            data-size="sm"
            aria-pressed={zoom === option}
            onClick={() => setZoom(option)}
          >
            {option * 100}%
          </button>
        ))}
        <CanvasAction value="center" data-size="sm">
          Center
        </CanvasAction>
        <CanvasAction value="nudge" data-size="sm">
          Nudge
        </CanvasAction>
      </div>
      <div data-slot="move-area">
        <CanvasSurface>
          <CanvasShape value="circle" aria-label="Circle" data-shape="round" />
          <CanvasShape value="square" aria-label="Square" />
        </CanvasSurface>
      </div>
    </Canvas>
  )
}

export { Example }
