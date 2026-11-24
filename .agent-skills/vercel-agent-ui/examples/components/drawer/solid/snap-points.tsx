import {
  Drawer,
  DrawerBackdrop,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from "@ui-sdk/solid/drawer"
import { For } from "solid-js"

const places = [
  { name: "Blue Bottle Coffee", detail: "Coffee · 0.2 mi" },
  { name: "Tartine Bakery", detail: "Bakery · 0.4 mi" },
  { name: "Dolores Park", detail: "Park · 0.5 mi" },
  { name: "Mission Dolores", detail: "Landmark · 0.6 mi" },
  { name: "Ritual Coffee Roasters", detail: "Coffee · 0.7 mi" },
  { name: "Bi-Rite Creamery", detail: "Ice cream · 0.7 mi" },
  { name: "Alamo Square", detail: "Park · 1.1 mi" },
  { name: "The Castro Theatre", detail: "Cinema · 1.2 mi" },
  { name: "Ferry Building", detail: "Market · 2.3 mi" },
  { name: "Coit Tower", detail: "Landmark · 2.9 mi" },
  { name: "Golden Gate Park", detail: "Park · 3.0 mi" },
  { name: "Lands End", detail: "Trail · 5.4 mi" },
]

function Example() {
  return (
    <Drawer snapPoints={[0.25, 0.5, 1]} defaultSnapPoint={0.5} expandOnScroll>
      <DrawerTrigger>Find a Place</DrawerTrigger>
      <DrawerBackdrop />
      <DrawerContent>
        <DrawerHandle aria-label="Resize" />
        <div data-slot="stack">
          <DrawerTitle>Places nearby</DrawerTitle>
          <DrawerDescription>
            Drag the drawer, or press the handle, to see more.
          </DrawerDescription>
        </div>
        <div data-slot="scroll">
          <ul data-slot="list">
            <For each={places}>
              {(place) => (
                <li>
                  <div>{place.name}</div>
                  <div data-slot="hint">{place.detail}</div>
                </li>
              )}
            </For>
          </ul>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

export { Example }
