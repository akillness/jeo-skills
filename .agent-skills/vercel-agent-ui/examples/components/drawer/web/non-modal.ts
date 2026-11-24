import "@ui-sdk/web/drawer"

const places = [
  { name: "Blue Bottle Coffee", detail: "Coffee · 0.2 mi" },
  { name: "Tartine Bakery", detail: "Bakery · 0.4 mi" },
  { name: "Dolores Park", detail: "Park · 0.5 mi" },
  { name: "Mission Dolores", detail: "Landmark · 0.6 mi" },
  { name: "Ritual Coffee Roasters", detail: "Coffee · 0.7 mi" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ul data-slot="list" aria-label="Places">
        ${places
          .map(
            (place) => `<li>
              <button type="button" data-place="${place.name}">${place.name}<span data-slot="hint">${place.detail}</span></button>
            </li>`
          )
          .join("")}
      </ul>
      <ui-drawer snap-points="0.2,0.6" modal-above="0.2">
        <ui-drawer-trigger><button>Get Directions</button></ui-drawer-trigger>
        <ui-drawer-backdrop hidden></ui-drawer-backdrop>
        <ui-drawer-content hidden>
          <ui-drawer-handle><button aria-label="Resize"></button></ui-drawer-handle>
          <div data-slot="row">
            <div data-slot="stack">
              <ui-drawer-title></ui-drawer-title>
              <ui-drawer-description></ui-drawer-description>
            </div>
            <ui-drawer-close><button>Done</button></ui-drawer-close>
          </div>
          <ol data-slot="stack">
            <li>Head north on Valencia St.</li>
            <li>Turn left onto 18th St.</li>
            <li></li>
          </ol>
        </ui-drawer-content>
      </ui-drawer>
    </div>
  `
  const content = root.querySelector("ui-drawer-content")!
  const title = root.querySelector("ui-drawer-title")!
  const description = root.querySelector("ui-drawer-description")!
  const arrival = root.querySelector("ol li:last-child")!
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-place]")]
  const select = (destination: string) => {
    for (const button of buttons) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.place === destination)
      )
    }
    title.textContent = `To ${destination}`
    arrival.textContent = `Arrive at ${destination}.`
  }
  const describe = () => {
    description.textContent = content.hasAttribute("data-interactive")
      ? "12 min walk. Pick another place behind the sheet."
      : "12 min walk. Drag the sheet down to see the places."
  }
  for (const button of buttons) {
    button.addEventListener("click", () => select(button.dataset.place!))
  }
  new MutationObserver(describe).observe(content, {
    attributes: true,
    attributeFilter: ["data-interactive"],
  })
  select(places[0].name)
  describe()
}

export { mount }
