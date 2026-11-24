import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from "@ui-sdk/solid/drawer"
import { createSignal, For } from "solid-js"

const places = [
  { name: "Blue Bottle Coffee", detail: "Coffee · 0.2 mi" },
  { name: "Tartine Bakery", detail: "Bakery · 0.4 mi" },
  { name: "Dolores Park", detail: "Park · 0.5 mi" },
  { name: "Mission Dolores", detail: "Landmark · 0.6 mi" },
  { name: "Ritual Coffee Roasters", detail: "Coffee · 0.7 mi" },
]

function Example() {
  const [destination, setDestination] = createSignal(places[0].name)
  return (
    <div data-slot="stack">
      <ul data-slot="list" aria-label="Places">
        <For each={places}>
          {(place) => (
            <li>
              <button
                type="button"
                aria-pressed={destination() === place.name ? "true" : "false"}
                onClick={() => setDestination(place.name)}
              >
                {place.name}
                <span data-slot="hint">{place.detail}</span>
              </button>
            </li>
          )}
        </For>
      </ul>
      <Drawer snapPoints={[0.2, 0.6]} modalAbove={0.2}>
        <DrawerTrigger>Get Directions</DrawerTrigger>
        <DrawerBackdrop />
        <DrawerContent>
          {(state) => (
            <>
              <DrawerHandle aria-label="Resize" />
              <div data-slot="row">
                <div data-slot="stack">
                  <DrawerTitle>To {destination()}</DrawerTitle>
                  <DrawerDescription>
                    {state.interactive
                      ? "12 min walk. Pick another place behind the sheet."
                      : "12 min walk. Drag the sheet down to see the places."}
                  </DrawerDescription>
                </div>
                <DrawerClose>Done</DrawerClose>
              </div>
              <ol data-slot="stack">
                <li>Head north on Valencia St.</li>
                <li>Turn left onto 18th St.</li>
                <li>Arrive at {destination()}.</li>
              </ol>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  )
}

export { Example }
