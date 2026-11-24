import "@ui-sdk/web/hover-card"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const sides = [
  { value: "top", label: "Top" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
]
const aligns = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
]

const select = (
  name: string,
  label: string,
  options: { value: string; label: string }[],
  value: string
) => `
  <ui-select data-control="${name}" default-value="${value}">
    <ui-select-label>${label}</ui-select-label>
    <ui-select-trigger>
      <button>
        <ui-select-value></ui-select-value>
        ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
      </button>
    </ui-select-trigger>
    <ui-select-content hidden>
      ${options
        .map(
          (option) => `
            <ui-select-item value="${option.value}">
              ${option.label}
              <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
            </ui-select-item>
          `
        )
        .join("")}
    </ui-select-content>
  </ui-select>
`

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        ${select("side", "Side", sides, "bottom")}
        ${select("align", "Align", aligns, "center")}
      </div>
      <ui-hover-card>
        <ui-hover-card-trigger><a href="https://example.com/people/ines">@ines</a></ui-hover-card-trigger>
        <ui-hover-card-content hidden side="bottom" align="center" side-offset="10">
          <ui-hover-card-arrow></ui-hover-card-arrow>
          <p>Inès Moreau</p>
          <p>Product designer. Leads the checkout redesign.</p>
        </ui-hover-card-content>
      </ui-hover-card>
    </div>
  `
  const content = root.querySelector("ui-hover-card-content")!
  for (const control of root.querySelectorAll("ui-select")) {
    control.addEventListener("valuechange", (event) => {
      if (event.detail.value) {
        content.setAttribute(
          control.dataset.control!,
          String(event.detail.value)
        )
      }
    })
  }
}

export { mount }
