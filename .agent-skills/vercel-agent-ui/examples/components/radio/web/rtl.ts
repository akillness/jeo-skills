import "@ui-sdk/web/field"
import "@ui-sdk/web/radio"

const speeds = [
  { value: "standard", label: "عادي" },
  { value: "express", label: "سريع" },
  { value: "overnight", label: "خلال ليلة" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-field>
        <ui-field-label>سرعة الشحن</ui-field-label>
        <ui-radio-group default-value="express">
          ${speeds
            .map(
              (speed) => `
                <label data-slot="label">
                  <ui-radio value="${speed.value}">
                    <ui-radio-indicator></ui-radio-indicator>
                  </ui-radio>
                  ${speed.label}
                </label>
              `
            )
            .join("")}
        </ui-radio-group>
      </ui-field>
    </div>
  `
}

export { mount }
