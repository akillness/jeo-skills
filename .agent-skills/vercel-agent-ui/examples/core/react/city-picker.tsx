import * as React from "react"
import {
  createTypeahead,
  definePrimitive,
  elements,
  idPart,
  isTypeaheadKey,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type CityPickerOptions = {
  delay?: number
  onPick?: (city: string) => void
}

type CityPickerState = { city: string; picked: string | null }

const cityPicker = definePrimitive({
  name: "city-picker",
  options: { delay: "number", onPick: "callback" },
  state: (_options: CityPickerOptions): CityPickerState => ({
    city: "Nairobi",
    picked: null,
  }),
  api: (context) => {
    let delay = context.options().delay
    let typeahead = createTypeahead(delay)
    context.onOptions((options) => {
      if (options.delay === delay) {
        return
      }
      delay = options.delay
      typeahead.reset()
      typeahead = createTypeahead(delay)
    })
    return {
      keydown(event: KeyboardEvent) {
        const cities = elements(context, "city").map((city) => city.key)
        const { city } = context.store.get()
        if (event.key === "Escape") {
          return typeahead.reset()
        }
        if (
          event.key === "Enter" ||
          (event.key === " " && !typeahead.active())
        ) {
          event.preventDefault()
          context.store.set({ picked: city })
          return context.options().onPick?.(city)
        }
        if (!isTypeaheadKey(event)) {
          return
        }
        const next = typeahead(event.key, cities, cities.indexOf(city))
        event.preventDefault()
        if (next !== -1) {
          context.store.set({ city: cities[next] })
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}>({
      attrs: (state, part) => ({
        role: "listbox",
        tabindex: "0",
        "aria-activedescendant": `${part.id}-${idPart(state.city)}`,
      }),
      on: { keydown: (event, { api }) => api.keydown(event) },
    }),
    city: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        role: "option",
        id: `${part.id}-${idPart(part.key)}`,
        "aria-selected": String(state.city === part.key),
        "data-picked": state.picked === part.key ? "" : undefined,
      }),
    }),
  }),
})

const parts = createParts(cityPicker, { root: "div", city: "div" })

const CityPicker = parts.Root

const CityPickerCity = parts.City

const cities = [
  "Nairobi",
  "Naples",
  "New Delhi",
  "New Orleans",
  "New York",
  "Newark",
  "Nice",
]

function Example() {
  const [slow, setSlow] = React.useState(false)
  const log = useLog()
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <input
            type="checkbox"
            checked={slow}
            onChange={(event) => setSlow(event.target.checked)}
          />
          Wait 1.5 seconds between keys
        </label>
      </div>
      <CityPicker
        aria-label="City"
        delay={slow ? 1500 : 500}
        onPick={(city) => log(`Picked ${city}`)}
      >
        {cities.map((city) => (
          <CityPickerCity key={city} value={city}>
            {city}
            <span aria-hidden="true" data-show="picked">
              ✓
            </span>
          </CityPickerCity>
        ))}
      </CityPicker>
    </div>
  )
}

export {
  CityPicker,
  CityPickerCity,
  cityPicker,
  type CityPickerOptions,
  type CityPickerState,
  Example,
}
