import "@ui-sdk/web/field"
import "@ui-sdk/web/time-input"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-field>
        <ui-field-label>12-hour clock</ui-field-label>
        <ui-time-input hour-cycle="12" default-value="18:45"></ui-time-input>
      </ui-field>
      <ui-field>
        <ui-field-label>24-hour clock</ui-field-label>
        <ui-time-input hour-cycle="24" default-value="18:45"></ui-time-input>
      </ui-field>
      <ui-field>
        <ui-field-label>With seconds</ui-field-label>
        <ui-time-input granularity="second" hour-cycle="24" default-value="18:45:30"></ui-time-input>
      </ui-field>
    </div>
  `
}

export { mount }
