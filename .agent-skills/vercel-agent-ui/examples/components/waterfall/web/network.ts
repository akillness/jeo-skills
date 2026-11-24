import type { WaterfallData } from "@ui-sdk/core/waterfall"
import "@ui-sdk/web/waterfall"

const requests: WaterfallData = [
  { value: "document", label: "/", start: 0, duration: 182 },
  { value: "styles", label: "app.css", start: 190, duration: 96 },
  { value: "script", label: "app.js", start: 192, duration: 410 },
  { value: "font", label: "inter.woff2", start: 300, duration: 220 },
  { value: "user", label: "api/user", start: 610, duration: 240 },
  { value: "avatar", label: "avatar.png", start: 860, duration: 150 },
]

const sizes: Record<string, string> = {
  document: "14 kB",
  styles: "8 kB",
  script: "212 kB",
  font: "48 kB",
  user: "1 kB",
  avatar: "36 kB",
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-waterfall aria-label="Network requests">
      <ui-waterfall-header-row>
        <ui-waterfall-column-header>Name</ui-waterfall-column-header>
        <ui-waterfall-column-header>Size</ui-waterfall-column-header>
        <ui-waterfall-column-header aria-label="Timeline">
          <ui-waterfall-axis max-ticks="5"></ui-waterfall-axis>
          <ui-waterfall-mark time="620">DOMContentLoaded</ui-waterfall-mark>
        </ui-waterfall-column-header>
      </ui-waterfall-header-row>
      ${requests
        .map(
          (request) => `
            <ui-waterfall-row value="${request.value}">
              <ui-waterfall-row-header>${request.label}</ui-waterfall-row-header>
              <ui-waterfall-cell>${sizes[request.value]}</ui-waterfall-cell>
              <ui-waterfall-bar></ui-waterfall-bar>
            </ui-waterfall-row>`
        )
        .join("")}
    </ui-waterfall>
  `
  const waterfall = root.querySelector("ui-waterfall")!
  waterfall.getBarLabel = (request, { start, duration }) =>
    `${sizes[request.value]}, starts at ${start}, takes ${duration}`
  waterfall.items = requests
}

export { mount }
