import "@ui-sdk/web/tooltip"

const sides = [
  { side: "top", label: "Top" },
  { side: "left", label: "Left" },
  { side: "right", label: "Right" },
  { side: "bottom", label: "Bottom" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="grid">
      ${sides
        .map(
          ({ side, label }) => `
            <ui-tooltip>
              <ui-tooltip-trigger><button>${label}</button></ui-tooltip-trigger>
              <ui-tooltip-content side="${side}">Add to library</ui-tooltip-content>
            </ui-tooltip>
          `
        )
        .join("")}
    </div>
  `
}

export { mount }
