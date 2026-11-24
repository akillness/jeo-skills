import * as React from "react"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  MapPinIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react"
import {
  createViewport,
  css,
  definePrimitive,
  live,
  type Viewport,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type Sight = { value: string; label: string; x: number; y: number }

type MapState = { viewport: Viewport; sights: Sight[] }

const pin = { width: 96, height: 28 }

const sights: Sight[] = [
  { value: "museum", label: "Museum", x: 24, y: 24 },
  { value: "park", label: "Park", x: 260, y: 120 },
  { value: "market", label: "Market", x: 80, y: 260 },
  { value: "tower", label: "Tower", x: 520, y: 60 },
  { value: "harbor", label: "Harbor", x: 640, y: 380 },
]

const map = definePrimitive({
  name: "map",
  state: (): MapState => ({ viewport: { x: 0, y: 0, zoom: 1 }, sights }),
  live: ["viewport"],
  api: (context) => {
    const { store } = context
    const viewport = createViewport<MapState>(context, {
      key: "viewport",
      surface: () => context.element("frame"),
      minZoom: () => 0.25,
      maxZoom: () => 2,
      message: (zoom) => `Map at ${Math.round(zoom * 100)} percent`,
    })
    const bounds = () => {
      const all = store.get().sights
      return {
        left: Math.min(...all.map((sight) => sight.x)),
        top: Math.min(...all.map((sight) => sight.y)),
        right: Math.max(...all.map((sight) => sight.x + pin.width)),
        bottom: Math.max(...all.map((sight) => sight.y + pin.height)),
      }
    }
    return {
      viewport,
      act(action: string) {
        if (action === "fit") {
          viewport.fit(bounds(), { padding: 16, maxZoom: 1 })
        } else if (action === "in") {
          viewport.zoomBy(1.25)
        } else if (action === "out") {
          viewport.zoomBy(1 / 1.25)
        } else if (action === "reset") {
          viewport.zoomTo(1)
        } else if (action === "left") {
          viewport.panBy(80, 0)
        } else if (action === "right") {
          viewport.panBy(-80, 0)
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot({}),
    frame: slot({
      attrs: () => ({
        tabindex: "0",
        "aria-roledescription": "map",
        style: css({
          position: "relative",
          overflow: "clip",
          "touch-action": "none",
        }),
      }),
      on: {
        wheel: (event, { api }) => api.viewport.wheel(event),
        pointerdown: (event, { el, api }) =>
          event.target === el && api.viewport.pointerdown(event),
        keydown: (event, { api }) => api.viewport.keydown(event),
      },
    }),
    world: slot({
      attrs: () => ({
        style: css({ position: "absolute", left: "0", top: "0" }),
      }),
      live: live<MapState, any, {}>((state, { api }) => ({
        style: api.viewport.style(state),
      })),
    }),
    sight: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { key }) => {
        const sight = state.sights.find((other) => other.value === key)!
        return {
          type: "button",
          style: css({
            position: "absolute",
            left: `${sight.x}px`,
            top: `${sight.y}px`,
            width: `${pin.width}px`,
            height: `${pin.height}px`,
          }),
        }
      },
      on: {
        focus: (_event, { el, api }) =>
          api.viewport.reveal(api.viewport.rectOf(el!), { padding: 16 }),
      },
    }),
    zoom: slot({
      live: live<MapState, any, {}>((state) => ({
        "data-zoom": `${Math.round(state.viewport.zoom * 100)}%`,
      })),
    }),
    action: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }) => api.act(key),
    }),
  }),
})

const parts = createParts(map, {
  root: "div",
  frame: "div",
  world: "div",
  sight: "button",
  zoom: "span",
  action: "button",
})

const SightsMap = parts.Root

const SightsMapFrame = parts.Frame

const SightsMapWorld = parts.World

const SightsMapSight = parts.Sight

const SightsMapZoom = parts.Zoom

const SightsMapAction = parts.Action

function Example() {
  return (
    <SightsMap>
      <SightsMapFrame aria-label="Sights">
        <SightsMapWorld>
          {sights.map((sight) => (
            <SightsMapSight key={sight.value} value={sight.value}>
              <MapPinIcon aria-hidden="true" />
              {sight.label}
            </SightsMapSight>
          ))}
        </SightsMapWorld>
      </SightsMapFrame>
      <div data-slot="row">
        <SightsMapAction data-size="sm" value="fit">
          Fit
        </SightsMapAction>
        <SightsMapAction data-size="sm" value="out" aria-label="Zoom out">
          <ZoomOutIcon aria-hidden="true" />
        </SightsMapAction>
        <SightsMapAction data-size="sm" value="in" aria-label="Zoom in">
          <ZoomInIcon aria-hidden="true" />
        </SightsMapAction>
        <SightsMapAction data-size="sm" value="reset">
          100%
        </SightsMapAction>
        <SightsMapAction data-size="sm" value="left" aria-label="Pan left">
          <ArrowLeftIcon aria-hidden="true" />
        </SightsMapAction>
        <SightsMapAction data-size="sm" value="right" aria-label="Pan right">
          <ArrowRightIcon aria-hidden="true" />
        </SightsMapAction>
        <SightsMapZoom />
      </div>
    </SightsMap>
  )
}

export {
  Example,
  map,
  type MapState,
  type Sight,
  SightsMap,
  SightsMapAction,
  SightsMapFrame,
  SightsMapSight,
  SightsMapWorld,
  SightsMapZoom,
}
