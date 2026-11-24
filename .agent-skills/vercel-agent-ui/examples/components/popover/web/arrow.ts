import "@ui-sdk/web/popover"
import { CircleQuestionMark, createElement } from "lucide"

const sides = [
  { value: "top", label: "Top" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls" role="group" aria-label="Side">
        ${sides
          .map(
            (option) =>
              `<button type="button" data-size="sm" value="${option.value}" aria-pressed="${option.value === "bottom"}">${option.label}</button>`
          )
          .join("")}
      </div>
      <ui-popover>
        <ui-popover-trigger>
          <button aria-label="Help">${createElement(CircleQuestionMark, { "aria-hidden": "true" }).outerHTML}</button>
        </ui-popover-trigger>
        <ui-popover-content side="bottom" side-offset="10" arrow-padding="12">
          <ui-popover-arrow></ui-popover-arrow>
          <ui-popover-title>Keyboard shortcuts</ui-popover-title>
          <ui-popover-description>Press ? anywhere to see them all.</ui-popover-description>
        </ui-popover-content>
      </ui-popover>
    </div>
  `
  const controls = root.querySelector<HTMLElement>("[data-slot=controls]")!
  const content = root.querySelector("ui-popover-content")!
  controls.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest("button")
    if (!button) {
      return
    }
    content.setAttribute("side", button.value)
    for (const other of controls.querySelectorAll("button")) {
      other.setAttribute("aria-pressed", String(other === button))
    }
  })
  root.querySelector("ui-popover")!.addEventListener("openchange", (event) => {
    const { reason, event: cause } = event.detail
    const inControls =
      cause?.target instanceof Node && controls.contains(cause.target)
    if (inControls && reason !== "escape-key") {
      event.preventDefault()
    }
  })
}

export { mount }
