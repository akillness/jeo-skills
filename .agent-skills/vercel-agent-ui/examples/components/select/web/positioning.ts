import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const fonts = [
  { value: "inter", label: "Inter" },
  { value: "geist", label: "Geist" },
  { value: "source-serif", label: "Source Serif" },
  { value: "geist-mono", label: "Geist Mono" },
]

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

const item = (option: { value: string; label: string }) => `
  <ui-select-item value="${option.value}">
    ${option.label}
    <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
  </ui-select-item>
`

const control = (
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
    <ui-select-content>
      ${options.map(item).join("")}
    </ui-select-content>
  </ui-select>
`

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        ${control("side", "Side", sides, "bottom")}
        ${control("align", "Align", aligns, "start")}
        <label data-slot="label">
          <ui-checkbox>
            <ui-checkbox-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-checkbox-indicator>
          </ui-checkbox>
          Anchor to the box
        </label>
      </div>
      <div id="select-positioning-box" data-slot="card">
        <ui-select default-value="inter">
          <ui-select-trigger>
            <button aria-label="Font">
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content side="bottom" align="start" side-offset="10" align-offset="0" collision-padding="16">
            <ui-select-arrow></ui-select-arrow>
            ${fonts.map(item).join("")}
          </ui-select-content>
        </ui-select>
      </div>
    </div>
  `
  const content = root.querySelector(
    "#select-positioning-box ui-select-content"
  )!
  const [side, align] = root.querySelectorAll("ui-select")
  side.items = sides
  align.items = aligns
  for (const control of [side, align]) {
    control.addEventListener("valuechange", (event) => {
      if (event.detail.value) {
        content.setAttribute(
          control.dataset.control!,
          String(event.detail.value)
        )
      }
    })
  }
  root
    .querySelector("ui-checkbox")!
    .addEventListener("checkedchange", (event) => {
      if (event.detail.value === true) {
        content.setAttribute("anchor", "#select-positioning-box")
      } else {
        content.removeAttribute("anchor")
      }
    })
}

export { mount }
