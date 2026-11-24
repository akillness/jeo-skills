import "@ui-sdk/web/scroll-area"

const swatches = [
  { name: "Sand", color: "#e6d8bf" },
  { name: "Clay", color: "#c98b6b" },
  { name: "Rust", color: "#a4502f" },
  { name: "Moss", color: "#7d8b5a" },
  { name: "Sage", color: "#b5c2a3" },
  { name: "Fog", color: "#c9d1d6" },
  { name: "Slate", color: "#5b6b78" },
  { name: "Ink", color: "#2b2f36" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-scroll-area type="auto">
      <ui-scroll-area-viewport role="region" aria-label="Palette">
        <ui-scroll-area-content>
          <ul>
            ${swatches
              .map(
                (swatch) => `
                  <li>
                    <div data-slot="swatch" style="background: ${swatch.color}"></div>
                    ${swatch.name}
                  </li>`
              )
              .join("")}
          </ul>
        </ui-scroll-area-content>
      </ui-scroll-area-viewport>
      <ui-scroll-area-scrollbar orientation="horizontal">
        <ui-scroll-area-thumb></ui-scroll-area-thumb>
      </ui-scroll-area-scrollbar>
    </ui-scroll-area>
  `
}

export { mount }
