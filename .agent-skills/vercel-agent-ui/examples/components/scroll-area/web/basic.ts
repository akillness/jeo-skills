import "@ui-sdk/web/scroll-area"

const tags = Array.from(
  { length: 50 },
  (_, index) => `v1.2.0-beta.${50 - index}`
)

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-scroll-area>
      <ui-scroll-area-viewport role="region" aria-label="Tags">
        <ui-scroll-area-content>
          <h3>Tags</h3>
          <ul>
            ${tags.map((tag) => `<li>${tag}</li>`).join("")}
          </ul>
        </ui-scroll-area-content>
      </ui-scroll-area-viewport>
      <ui-scroll-area-scrollbar>
        <ui-scroll-area-thumb></ui-scroll-area-thumb>
      </ui-scroll-area-scrollbar>
    </ui-scroll-area>
  `
}

export { mount }
