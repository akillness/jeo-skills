import "@ui-sdk/web/timeline"
import { log } from "../../../shared/web/log"

const updates = [
  {
    author: "Ada",
    date: "2026-11-10",
    time: "Nov 10",
    text: "Shipped the new onboarding flow.",
  },
  {
    author: "Grace",
    date: "2026-11-10",
    time: "Nov 10",
    text: "Fixed the flaky upload test.",
  },
  {
    author: "Linus",
    date: "2026-11-09",
    time: "Nov 9",
    text: "Moved the docs to the new theme.",
  },
  {
    author: "Margaret",
    date: "2026-11-09",
    time: "Nov 9",
    text: "Wrote the launch checklist.",
  },
  {
    author: "Ada",
    date: "2026-11-08",
    time: "Nov 8",
    text: "Cut search latency in half.",
  },
  {
    author: "Grace",
    date: "2026-11-07",
    time: "Nov 7",
    text: "Added keyboard shortcuts to the editor.",
  },
  {
    author: "Linus",
    date: "2026-11-06",
    time: "Nov 6",
    text: "Cleaned up the old billing code.",
  },
  {
    author: "Margaret",
    date: "2026-11-05",
    time: "Nov 5",
    text: "Ran the accessibility review.",
  },
  {
    author: "Ada",
    date: "2026-11-04",
    time: "Nov 4",
    text: "Started the mobile layout.",
  },
]

const pageSize = 3

const article = (update: (typeof updates)[number]) => `
  <ui-timeline-item>
    <ui-timeline-marker></ui-timeline-marker>
    <ui-timeline-connector></ui-timeline-connector>
    <ui-timeline-title>${update.author}</ui-timeline-title>
    <ui-timeline-time><time datetime="${update.date}">${update.time}</time></ui-timeline-time>
    <ui-timeline-description>${update.text}</ui-timeline-description>
  </ui-timeline-item>`

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Load More</button>
      </div>
      <ui-timeline feed aria-label="Team updates">
        ${updates.slice(0, pageSize).map(article).join("")}
      </ui-timeline>
    </div>
  `
  const timeline = root.querySelector("ui-timeline")!
  const button = root.querySelector("button")!
  let count = pageSize
  let timer: ReturnType<typeof setTimeout> | undefined
  button.addEventListener("click", () => {
    timeline.busy = true
    button.disabled = true
    button.textContent = "Loading…"
    timer = setTimeout(() => {
      timeline.insertAdjacentHTML(
        "beforeend",
        updates
          .slice(count, count + pageSize)
          .map(article)
          .join("")
      )
      count += pageSize
      timeline.busy = false
      button.disabled = count >= updates.length
      button.textContent = "Load More"
      log(root, `Loaded ${pageSize} more updates`)
    }, 600)
  })
  return () => clearTimeout(timer)
}

export { mount }
