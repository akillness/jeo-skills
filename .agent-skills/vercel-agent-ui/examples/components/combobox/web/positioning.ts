import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/combobox"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "sveltekit", label: "SvelteKit" },
  { value: "nuxt", label: "Nuxt" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "solidstart", label: "SolidStart" },
  { value: "qwik", label: "Qwik City" },
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
        ${select("align", "Align", aligns, "start")}
        <label data-slot="label">
          <ui-checkbox>
            <ui-checkbox-indicator>
              ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
            </ui-checkbox-indicator>
          </ui-checkbox>
          Anchor to the box
        </label>
      </div>
      <div id="combobox-positioning-box" data-slot="card">
        <ui-combobox>
          <ui-combobox-input>
            <input aria-label="Framework" placeholder="Framework" />
          </ui-combobox-input>
          <ui-combobox-content hidden side="bottom" align="start" side-offset="10" align-offset="0" collision-padding="16">
            <ui-combobox-empty>No frameworks found.</ui-combobox-empty>
            <ui-combobox-list>
              ${frameworks
                .map(
                  (framework) => `
                    <ui-combobox-item value="${framework.value}" label="${framework.label}">
                      ${framework.label}
                      <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
                    </ui-combobox-item>
                  `
                )
                .join("")}
            </ui-combobox-list>
          </ui-combobox-content>
        </ui-combobox>
      </div>
    </div>
  `
  const content = root.querySelector("ui-combobox-content")!
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
  root
    .querySelector("ui-checkbox")!
    .addEventListener("checkedchange", (event) => {
      if (event.detail.value === true) {
        content.setAttribute("anchor", "#combobox-positioning-box")
      } else {
        content.removeAttribute("anchor")
      }
    })
}

export { mount }
