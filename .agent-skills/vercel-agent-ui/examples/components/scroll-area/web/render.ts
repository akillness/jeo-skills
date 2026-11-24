import "@ui-sdk/web/scroll-area"

const tags = Array.from(
  { length: 50 },
  (_, index) => `v1.2.0-beta.${50 - index}`
)

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-scroll-area as-child>
      <section>
        <ui-scroll-area-viewport as-child aria-label="Releases">
          <article>
            <ui-scroll-area-content>
              <ul>
                ${tags.map((tag) => `<li>${tag}</li>`).join("")}
              </ul>
            </ui-scroll-area-content>
          </article>
        </ui-scroll-area-viewport>
        <p data-slot="hint" aria-hidden="true">
          <span data-show="start">Scroll for older releases</span>
          <span data-show="more">More releases below</span>
        </p>
        <ui-scroll-area-scrollbar>
          <ui-scroll-area-thumb></ui-scroll-area-thumb>
        </ui-scroll-area-scrollbar>
      </section>
    </ui-scroll-area>
  `
}

export { mount }
