import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/popover"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-popover presentation="sheet">
      <ui-popover-trigger>
        <button>Add Reminder</button>
      </ui-popover-trigger>
      <ui-popover-content>
        <ui-popover-title>New reminder</ui-popover-title>
        <ui-popover-description>We'll notify you at the time you pick.</ui-popover-description>
        <ui-field>
          <ui-field-label>Remind me to</ui-field-label>
          <ui-input>
            <input value="Send the Q3 roadmap" />
          </ui-input>
        </ui-field>
        <div data-slot="row">
          <ui-popover-close>
            <button>Cancel</button>
          </ui-popover-close>
          <ui-popover-close>
            <button data-variant="solid">Save</button>
          </ui-popover-close>
        </div>
      </ui-popover-content>
    </ui-popover>
  `
}

export { mount }
