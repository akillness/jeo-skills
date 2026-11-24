import "@ui-sdk/web/combobox"
import { Check, createElement } from "lucide"

const countries = [
  { value: "ar", label: "Argentina", keywords: ["república argentina"] },
  { value: "au", label: "Australia", keywords: ["oz"] },
  { value: "at", label: "Austria", keywords: ["österreich"] },
  { value: "be", label: "Belgium", keywords: ["belgië", "belgique"] },
  { value: "br", label: "Brazil", keywords: ["brasil"] },
  { value: "ca", label: "Canada" },
  { value: "cl", label: "Chile" },
  { value: "dk", label: "Denmark", keywords: ["danmark"] },
  { value: "fi", label: "Finland", keywords: ["suomi"] },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany", keywords: ["deutschland"] },
  { value: "gr", label: "Greece", keywords: ["hellas", "ελλάδα"] },
  { value: "jp", label: "Japan", keywords: ["nippon", "日本"] },
  { value: "nl", label: "Netherlands", keywords: ["holland", "nederland"] },
  { value: "es", label: "Spain", keywords: ["españa"] },
  { value: "se", label: "Sweden", keywords: ["sverige"] },
  {
    value: "ch",
    label: "Switzerland",
    keywords: ["schweiz", "suisse", "svizzera"],
  },
]

const countryLabel = (value: string) =>
  countries.find((country) => country.value === value)?.label ?? value

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-combobox multiple default-value="fr, jp, se, de, ch">
      <div data-slot="stack">
        <ui-combobox-label>Countries</ui-combobox-label>
        <ui-combobox-chips>
          <ui-combobox-chips-overflow></ui-combobox-chips-overflow>
          <ui-combobox-input>
            <input placeholder="Add…" />
          </ui-combobox-input>
        </ui-combobox-chips>
        <p data-slot="hint"></p>
      </div>
      <ui-combobox-content hidden>
        <ui-combobox-empty>No countries found.</ui-combobox-empty>
        <ui-combobox-list>
          ${countries
            .map(
              (country) => `
                <ui-combobox-item value="${country.value}" label="${country.label}">
                  ${country.label}
                  <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
                </ui-combobox-item>
              `
            )
            .join("")}
        </ui-combobox-list>
      </ui-combobox-content>
      <template>
        <ui-combobox-chip>
          <ui-combobox-chip-remove><button type="button">×</button></ui-combobox-chip-remove>
        </ui-combobox-chip>
      </template>
    </ui-combobox>
  `
  const combobox = root.querySelector("ui-combobox")!
  combobox.itemToLabel = (value) => countryLabel(value as string)
  const summary = root.querySelector("p")!
  const list = new Intl.ListFormat(document.documentElement.lang || undefined, {
    type: "conjunction",
  })
  const show = (value: string[]) => {
    const labels = value.map(countryLabel)
    summary.textContent = list.format(
      labels.length > 2
        ? [...labels.slice(0, 2), `${labels.length - 2} more`]
        : labels
    )
  }
  show(["fr", "jp", "se", "de", "ch"])
  combobox.addEventListener("valuechange", (event) =>
    show(event.detail.value as string[])
  )
}

export { mount }
