import * as React from "react"
import { definePrimitive, nearestInDirection } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type CityMapState = { city: string }

const cities: Record<string, { x: number; y: number }> = {
  Lisbon: { x: 14, y: 78 },
  Paris: { x: 36, y: 40 },
  London: { x: 30, y: 18 },
  Berlin: { x: 64, y: 22 },
  Rome: { x: 62, y: 74 },
  Vienna: { x: 78, y: 46 },
}

const directions: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

const box = (city: string) => {
  const { x, y } = cities[city]
  return { left: x, right: x, top: y, bottom: y }
}

const cityMap = definePrimitive({
  name: "city-map",
  state: (): CityMapState => ({ city: "Paris" }),
  api: (context) => ({
    go(direction: readonly [number, number]) {
      const { city } = context.store.get()
      const others = Object.keys(cities)
        .filter((other) => other !== city)
        .map((other) => ({ key: other, rect: box(other) }))
      const next = nearestInDirection(box(city), others, direction)
      if (next) {
        context.store.set({ city: next })
      }
    },
  }),
  slots: (slot) => ({
    map: slot({
      attrs: (state) => ({
        role: "img",
        tabindex: "0",
        "aria-label": `Map, ${state.city} chosen`,
      }),
      on: {
        keydown: (event, { api }) => {
          const direction = directions[event.key]
          if (!direction) {
            return
          }
          event.preventDefault()
          api.go(direction)
        },
      },
    }),
    city: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        "data-chosen": state.city === part.key ? "" : undefined,
      }),
    }),
    arrow: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }) => api.go(directions[key]),
    }),
  }),
})

const parts = createParts(cityMap, {
  map: "div",
  city: "span",
  arrow: "button",
})

const CityMap = parts.Root

const CityMapMap = parts.Map

const CityMapCity = parts.City

const CityMapArrow = parts.Arrow

const labels = {
  ArrowUp: "North",
  ArrowLeft: "West",
  ArrowRight: "East",
  ArrowDown: "South",
}

function Example() {
  return (
    <CityMap>
      <div data-slot="stack">
        <div data-slot="controls">
          {Object.entries(labels).map(([key, label]) => (
            <CityMapArrow key={key} value={key} data-size="sm">
              {label}
            </CityMapArrow>
          ))}
        </div>
        <CityMapMap>
          {Object.entries(cities).map(([city, { x, y }]) => (
            <CityMapCity
              key={city}
              value={city}
              aria-hidden="true"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {city}
            </CityMapCity>
          ))}
        </CityMapMap>
      </div>
    </CityMap>
  )
}

export {
  CityMap,
  CityMapArrow,
  CityMapCity,
  CityMapMap,
  cityMap,
  type CityMapState,
  Example,
}
