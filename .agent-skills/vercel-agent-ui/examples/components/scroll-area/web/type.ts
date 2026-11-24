import "@ui-sdk/web/scroll-area"

const types = ["hover", "scroll", "auto", "always"]

const tags = Array.from(
  { length: 20 },
  (_, index) => `v1.2.0-beta.${50 - index}`
)

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="grid">
      ${types
        .map(
          (type) => `
            <div data-slot="stack">
              <code>type="${type}"</code>
              <ui-scroll-area type="${type}">
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
