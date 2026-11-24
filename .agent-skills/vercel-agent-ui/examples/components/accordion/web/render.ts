import "@ui-sdk/web/accordion"

const steps = [
  {
    value: "install",
    label: "Install the package",
    content: "Add it with your package manager. It has no dependencies.",
  },
  {
    value: "import",
    label: "Import the parts",
    content: "Import the accordion parts you need from the package.",
  },
  {
    value: "style",
    label: "Style it",
    content: "Every part renders its state as data attributes you can style.",
  },
]

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-accordion multiple default-value="install">
      ${steps
        .map(
          (step, index) => `
            <ui-accordion-item value="${step.value}">
              <ui-accordion-header>
                <h4>
                  <ui-accordion-trigger>
                    <button type="button" aria-expanded="${step.value === "install"}">
                      <span data-slot="hint" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
                      <span>${step.label}</span>
                      <span data-slot="hint" aria-hidden="true" data-show="closed">Show</span>
                      <span data-slot="hint" aria-hidden="true" data-show="open">Hide</span>
                    </button>
                  </ui-accordion-trigger>
                </h4>
              </ui-accordion-header>
              <ui-accordion-panel${step.value === "install" ? "" : " hidden"}>
                ${step.content}
              </ui-accordion-panel>
            </ui-accordion-item>`
        )
        .join("")}
    </ui-accordion>
  `
}
