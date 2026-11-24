import "@ui-sdk/web/scroll-area"

const delays = [
  { value: 0, label: "No delay" },
  { value: 2000, label: "2000 ms delay" },
]

const tags = Array.from(
  { length: 20 },
  (_, index) => `v1.2.0-beta.${50 - index}`
)

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="grid">
      ${delays
        .map(
          (delay) => `
            <div data-slot="stack">
              <span data-slot="hint">${delay.label}</span>
              <ui-scroll-area type="scroll" scroll-hide-delay="${delay.value}">
                <ui-scroll-area-viewport>
                  <ui-scroll-area-content>
                    <ul>
                      ${tags.map((tag) => `<li>${tag}</li>`).join("")}
                    </ul>
                  </ui-scroll-area-content>
                </ui-scroll-area-viewport>
                <ui-scroll-area-scrollbar>
                  <ui-scroll-area-thumb></ui-scroll-area-thumb>
                </ui-scroll-area-scrollbar>
              </ui-scroll-area>
            </div>`
        )
        .join("")}
    </div>
  `
}

export { mount }
