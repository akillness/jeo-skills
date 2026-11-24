import "@ui-sdk/web/switch"
import "@ui-sdk/web/field"

const settings = [
  {
    label: "Public profile",
    description: "Anyone can see your name and photo.",
    defaultChecked: false,
  },
  {
    label: "Show activity status",
    description: "Teammates can see when you're online.",
    defaultChecked: true,
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      ${settings
        .map(
          (setting) => `
            <ui-field data-variant="card">
              <div data-slot="stack">
                <ui-field-label>${setting.label}</ui-field-label>
                <ui-field-description>${setting.description}</ui-field-description>
              </div>
              <ui-switch${setting.defaultChecked ? " default-checked" : ""}>
                <ui-switch-thumb></ui-switch-thumb>
              </ui-switch>
            </ui-field>
          `
        )
        .join("")}
    </div>
  `
}

export { mount }
