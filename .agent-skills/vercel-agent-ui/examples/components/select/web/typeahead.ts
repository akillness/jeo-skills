import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const countries = [
  { value: "ar", label: "Argentina", code: "+54" },
  { value: "au", label: "Australia", code: "+61" },
  { value: "at", label: "Austria", code: "+43" },
  { value: "be", label: "Belgium", code: "+32" },
  { value: "br", label: "Brazil", code: "+55" },
  { value: "ca", label: "Canada", code: "+1" },
  { value: "dk", label: "Denmark", code: "+45" },
  { value: "fr", label: "France", code: "+33" },
  { value: "de", label: "Germany", code: "+49" },
  { value: "gr", label: "Greece", code: "+30" },
  { value: "ie", label: "Ireland", code: "+353" },
  { value: "jp", label: "Japan", code: "+81" },
  { value: "es", label: "Spain", code: "+34" },
  { value: "se", label: "Sweden", code: "+46" },
  { value: "ch", label: "Switzerland", code: "+41" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Country</ui-field-label>
      <ui-select default-value="fr">
        <ui-select-trigger>
          <button>
            <ui-select-value></ui-select-value>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-select-trigger>
        <ui-select-content>
          ${countries
            .map(
              (country) => `
                <ui-select-item value="${country.value}" label="${country.label}">
                  ${country.label}
                  <span data-slot="hint">${country.code}</span>
                  <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                </ui-select-item>
              `
            )
            .join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
  `
}

export { mount }
