import "@ui-sdk/web/drawer"

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

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-drawer snap-points="0.25,0.5,1" default-snap-point="0.5" expand-on-scroll>
      <ui-drawer-trigger><button>Find a Place</button></ui-drawer-trigger>
      <ui-drawer-backdrop hidden></ui-drawer-backdrop>
      <ui-drawer-content hidden>
        <ui-drawer-handle><button aria-label="Resize"></button></ui-drawer-handle>
        <div data-slot="stack">
          <ui-drawer-title>Places nearby</ui-drawer-title>
          <ui-drawer-description>Drag the drawer, or press the handle, to see more.</ui-drawer-description>
        </div>
        <div data-slot="scroll">
          <ul data-slot="list">
            ${places
              .map(
                (place) => `<li>
                  <div>${place.name}</div>
                  <div data-slot="hint">${place.detail}</div>
                </li>`
              )
              .join("")}
          </ul>
        </div>
      </ui-drawer-content>
    </ui-drawer>
  `
}

export { mount }
