import "@ui-sdk/web/resizable"
import { log } from "../../../shared/web/log"

const format = (layout: number[]) => layout.map(Math.round).join(" / ")

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-layout="50,50">Split Evenly</button>
        <button type="button" data-layout="30,70">Reset</button>
      </div>
      <ui-resizable default-layout="30,70">
        <ui-resizable-panel min-size="20">
          <h3>Files</h3>
          <ul>
            <li>page.tsx</li>
            <li>layout.tsx</li>
            <li>globals.css</li>
          </ul>
        </ui-resizable-panel>
        <ui-resizable-handle aria-label="Resize files"></ui-resizable-handle>
        <ui-resizable-panel min-size="20">
          <h3>page.tsx</h3>
          <span data-slot="hint">Saved just now</span>
        </ui-resizable-panel>
      </ui-resizable>
    </div>
  `
  const group = root.querySelector("ui-resizable")!
  let layout = [30, 70]
  group.addEventListener("layoutchange", (event) => {
    const { value, reason } = event.detail
    if (format(value) !== format(layout)) {
      log(root, `${format(value)} (${reason})`)
    }
    layout = value
  })
  root
    .querySelectorAll<HTMLButtonElement>("[data-layout]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => (group.layout = button.dataset.layout!.split(",").map(Number))
      )
    })
}

export { mount }
