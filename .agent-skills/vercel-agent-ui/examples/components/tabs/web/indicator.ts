import "@ui-sdk/web/tabs"

const orientations = [
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div>
      <div data-slot="controls" role="group" aria-label="Orientation">
        ${orientations
          .map(
            (option) => `
              <button type="button" data-size="sm" value="${option.value}" aria-pressed="${option.value === "horizontal"}">
                ${option.label}
              </button>`
          )
          .join("")}
      </div>
      <ui-tabs default-value="music" orientation="horizontal">
        <ui-tabs-list aria-label="Library">
          <ui-tabs-tab value="music">
            <button type="button">Music</button>
          </ui-tabs-tab>
          <ui-tabs-tab value="podcasts">
            <button type="button">Podcasts</button>
          </ui-tabs-tab>
          <ui-tabs-tab value="audiobooks">
            <button type="button">Audiobooks</button>
          </ui-tabs-tab>
          <ui-tabs-indicator></ui-tabs-indicator>
        </ui-tabs-list>
        <ui-tabs-panel value="music">312 songs in 24 albums, synced to this device.</ui-tabs-panel>
        <ui-tabs-panel value="podcasts">8 shows you follow, with 3 new episodes.</ui-tabs-panel>
        <ui-tabs-panel value="audiobooks">2 books in progress, 6 hours left in total.</ui-tabs-panel>
      </ui-tabs>
    </div>
  `
  const tabs = root.querySelector("ui-tabs")!
  const buttons = root.querySelectorAll<HTMLButtonElement>(
    '[data-slot="controls"] button'
  )
  for (const button of buttons) {
    button.addEventListener("click", () => {
      tabs.setAttribute("orientation", button.value)
      for (const other of buttons) {
        other.setAttribute("aria-pressed", String(other === button))
      }
    })
  }
}

export { mount }
