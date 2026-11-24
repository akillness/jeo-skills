import "@ui-sdk/web/scroll-area"
import { log } from "../../../shared/web/log"

const tags = Array.from(
  { length: 50 },
  (_, index) => `v1.2.0-beta.${50 - index}`
)

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-action="start">Back to Top</button>
        <button type="button" data-action="end">Jump to the End</button>
      </div>
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
    </div>
  `
  const { api } = root.querySelector("ui-scroll-area")!
  let edge: string | null = "start"
  root.querySelector('[data-action="start"]')!.addEventListener("click", () => {
    api.scrollToStart({ behavior: "smooth" })
  })
  root.querySelector('[data-action="end"]')!.addEventListener("click", () => {
    api.scrollToEnd({ behavior: "instant" })
  })
  root
    .querySelector("ui-scroll-area-viewport")!
    .addEventListener("scroll", () => {
      const next = api.isAtEnd() ? "end" : api.isAtStart() ? "start" : null
      if (next && next !== edge) {
        log(root, `At the ${next}`)
      }
      edge = next
    })
}

export { mount }
